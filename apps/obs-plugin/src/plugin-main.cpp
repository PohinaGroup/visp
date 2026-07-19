#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

struct control_response {
	uint64_t command_version;
	bool desired_streaming;
};

static const char *json_value(const char *json, const char *key)
{
	const char *value = strstr(json, key);
	if (!value)
		return NULL;
	value = strchr(value + strlen(key), ':');
	if (!value)
		return NULL;
	do {
		value++;
	} while (*value == ' ' || *value == '\t' || *value == '\r' || *value == '\n');
	return value;
}

static bool parse_control_response(const char *json, struct control_response *response)
{
	const char *version_value = json_value(json, "\"commandVersion\"");
	const char *streaming_value = json_value(json, "\"desiredStreaming\"");
	char *version_end = NULL;
	if (!version_value || !streaming_value)
		return false;

	const uint64_t version = strtoull(version_value, &version_end, 10);
	if (version_end == version_value)
		return false;
	if (strncmp(streaming_value, "true", 4) == 0) {
		response->desired_streaming = true;
	} else if (strncmp(streaming_value, "false", 5) == 0) {
		response->desired_streaming = false;
	} else {
		return false;
	}
	response->command_version = version;
	return true;
}

#ifdef VISP_PROTOCOL_TEST

#include <stdio.h>
#include <assert.h>
#undef NDEBUG

/* assert() is compiled out under -DNDEBUG (Release), so use a check that is
 * always evaluated and reports failure regardless of the build configuration. */
#define CHECK(expr)                                            \
	do {                                                  \
		if (!(expr)) {                                \
			fprintf(stderr, "check failed: %s\n", #expr); \
			return 1;                             \
		}                                             \
	} while (0)

int main(void)
{
	struct control_response response = {};
	CHECK(parse_control_response("{\"commandVersion\":7,\"desiredStreaming\":true,\"pollAfterMs\":2000}",
				     &response));
	CHECK(response.command_version == 7 && response.desired_streaming);
	CHECK(parse_control_response("{\"desiredStreaming\": false, \"commandVersion\": 8}", &response));
	CHECK(response.command_version == 8 && !response.desired_streaming);
	CHECK(!parse_control_response("{\"commandVersion\":9}", &response));
	return 0;
}

#else

#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QDialog>
#include <QDialogButtonBox>
#include <QFileDialog>
#include <QFormLayout>
#include <QLabel>
#include <QLineEdit>
#include <QMessageBox>
#include <QObject>
#include <QPushButton>
#include <QSettings>
#include <QString>
#include <QTimer>
#include <QUrl>
#include <QVBoxLayout>
#include <QWidget>
#include <obs-frontend-api.h>
#include <obs-module.h>
#include <plugin-support.h>
#include <util/config-file.h>

#define CONFIG_SECTION "visp"
#define DEFAULT_CONTROL_URL "https://app.example.com/api/obs/control"

OBS_DECLARE_MODULE()
OBS_MODULE_USE_DEFAULT_LOCALE(PLUGIN_NAME, "en-US")
OBS_MODULE_AUTHOR("VISP")

struct plugin_config {
	QString control_url;
	QString token;
};

static bool secure_url(const QString &value)
{
	const QUrl url(value);
	const bool local_http = url.scheme() == "http" &&
				(url.host() == "localhost" || url.host() == "127.0.0.1" || url.host() == "::1");
	return url.isValid() && !url.host().isEmpty() && (url.scheme() == "https" || local_http);
}

static plugin_config load_config()
{
	plugin_config result;
	char *path = obs_module_config_path("config.ini");
	config_t *config = NULL;
	if (!path)
		return result;
	if (config_open(&config, path, CONFIG_OPEN_ALWAYS) != CONFIG_SUCCESS) {
		obs_log(LOG_ERROR, "could not open configuration at %s", path);
		bfree(path);
		return result;
	}
	if (!config_has_user_value(config, CONFIG_SECTION, "control_url")) {
		config_set_string(config, CONFIG_SECTION, "control_url", DEFAULT_CONTROL_URL);
		config_set_string(config, CONFIG_SECTION, "token", "");
		config_save_safe(config, "tmp", NULL);
	}
	result.control_url = QString::fromUtf8(config_get_string(config, CONFIG_SECTION, "control_url"));
	result.token = QString::fromUtf8(config_get_string(config, CONFIG_SECTION, "token"));
	config_close(config);
	obs_log(LOG_INFO, "%s configuration from %s",
		!result.token.isEmpty() && secure_url(result.control_url) ? "loaded" : "waiting for", path);
	bfree(path);
	return result;
}

static bool save_config(const plugin_config &settings)
{
	char *path = obs_module_config_path("config.ini");
	config_t *config = NULL;
	if (!path)
		return false;
	if (config_open(&config, path, CONFIG_OPEN_ALWAYS) != CONFIG_SUCCESS) {
		obs_log(LOG_ERROR, "could not open configuration at %s", path);
		bfree(path);
		return false;
	}
	config_set_string(config, CONFIG_SECTION, "control_url", settings.control_url.toUtf8().constData());
	config_set_string(config, CONFIG_SECTION, "token", settings.token.toUtf8().constData());
	const bool saved = config_save_safe(config, "tmp", NULL) == CONFIG_SUCCESS;
	config_close(config);
	bfree(path);
	return saved;
}

class SettingsDialog final : public QDialog {
public:
	SettingsDialog(const plugin_config &settings, QWidget *parent) : QDialog(parent)
	{
		setWindowTitle("VISP Remote Control");
		setMinimumWidth(520);

		url.setText(settings.control_url.isEmpty() ? DEFAULT_CONTROL_URL : settings.control_url);
		token.setText(settings.token);
		token.setEchoMode(QLineEdit::PasswordEchoOnEdit);
		token.setPlaceholderText("Paste the token from the VISP dashboard");

		auto *form = new QFormLayout;
		form->addRow("Control URL", &url);
		form->addRow("Pairing token", &token);

		auto *import_button = new QPushButton("Import config.ini");
		connect(import_button, &QPushButton::clicked, this, [this]() { import_config(); });

		auto *buttons = new QDialogButtonBox(QDialogButtonBox::Save | QDialogButtonBox::Cancel);
		connect(buttons, &QDialogButtonBox::accepted, this, [this]() { validate_and_accept(); });
		connect(buttons, &QDialogButtonBox::rejected, this, &QDialog::reject);

		auto *layout = new QVBoxLayout(this);
		layout->addWidget(
			new QLabel("Paste a pairing token, or import the config downloaded from the VISP dashboard."));
		layout->addLayout(form);
		layout->addWidget(import_button, 0, Qt::AlignLeft);
		layout->addWidget(buttons);
	}

	plugin_config settings() const { return {url.text().trimmed(), token.text().trimmed()}; }

private:
	void import_config()
	{
		const QString path = QFileDialog::getOpenFileName(this, "Import VISP config", {}, "INI files (*.ini)");
		if (path.isEmpty())
			return;
		QSettings imported(path, QSettings::IniFormat);
		imported.beginGroup(CONFIG_SECTION);
		const QString imported_url = imported.value("control_url").toString().trimmed();
		const QString imported_token = imported.value("token").toString().trimmed();
		imported.endGroup();
		if (imported_url.isEmpty() || imported_token.isEmpty()) {
			QMessageBox::warning(this, "Invalid config",
					     "The file must contain [visp], control_url, and token.");
			return;
		}
		url.setText(imported_url);
		token.setText(imported_token);
	}

	void validate_and_accept()
	{
		const plugin_config value = settings();
		if (!secure_url(value.control_url)) {
			QMessageBox::warning(this, "Invalid control URL", "Use an HTTPS URL (or HTTP on localhost).");
			return;
		}
		if (value.token.isEmpty()) {
			QMessageBox::warning(this, "Missing token", "Paste a pairing token or import a config file.");
			return;
		}
		accept();
	}

	QLineEdit url;
	QLineEdit token;
};

class VispControl final : public QObject {
public:
	VispControl(const plugin_config &settings)
		: url(QUrl(settings.control_url)),
		  authorization("Bearer " + settings.token.toUtf8()),
		  network(this),
		  timer(this),
		  streaming(obs_frontend_streaming_active())
	{
		connect(&timer, &QTimer::timeout, this, [this]() { poll(); });
		timer.start(2000);
		poll();
	}

	~VispControl() override
	{
		timer.stop();
		if (pending) {
			disconnect(pending, nullptr, this, nullptr);
			pending->abort();
		}
	}

	void set_streaming(bool active) { streaming = active; }

private:
	void poll()
	{
		if (pending)
			return;
		QNetworkRequest request(url);
		request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
		request.setRawHeader("Authorization", authorization);
		request.setTransferTimeout(5000);
		request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
		const QByteArray body = QByteArray("{\"streaming\":") + (streaming ? "true" : "false") +
					",\"appliedVersion\":" + QByteArray::number(applied_version) + "}";
		pending = network.post(request, body);
		connect(pending, &QNetworkReply::finished, this, [this, reply = pending]() {
			pending = nullptr;
			handle_response(reply);
			reply->deleteLater();
		});
	}

	void handle_response(QNetworkReply *reply)
	{
		const int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
		if (status == 401) {
			obs_log(LOG_ERROR, "pairing token was rejected; rotate it in the VISP dashboard");
			return;
		}
		if (reply->error() != QNetworkReply::NoError || status < 200 || status >= 300)
			return;

		const QByteArray body = reply->readAll();
		struct control_response response;
		if (!parse_control_response(body.constData(), &response)) {
			obs_log(LOG_WARNING, "control service returned an invalid response");
			return;
		}

		if (response.command_version <= applied_version)
			return;
		const bool active = obs_frontend_streaming_active();
		if (response.desired_streaming != active) {
			if (response.desired_streaming)
				obs_frontend_streaming_start();
			else
				obs_frontend_streaming_stop();
		}
		applied_version = response.command_version;
	}

	QUrl url;
	QByteArray authorization;
	QNetworkAccessManager network;
	QTimer timer;
	QNetworkReply *pending = nullptr;
	uint64_t applied_version = 0;
	bool streaming;
};

static VispControl *control;

static void apply_config(const plugin_config &settings)
{
	delete control;
	control = NULL;
	if (!settings.token.isEmpty() && secure_url(settings.control_url))
		control = new VispControl(settings);
}

static void open_settings(void *private_data)
{
	UNUSED_PARAMETER(private_data);
	auto *parent = static_cast<QWidget *>(obs_frontend_get_main_window());
	SettingsDialog dialog(load_config(), parent);
	if (dialog.exec() != QDialog::Accepted)
		return;
	const plugin_config settings = dialog.settings();
	if (!save_config(settings)) {
		QMessageBox::critical(parent, "VISP Remote Control", "Could not save the plugin configuration.");
		return;
	}
	apply_config(settings);
}

static void frontend_event(enum obs_frontend_event event, void *private_data)
{
	UNUSED_PARAMETER(private_data);
	if (!control)
		return;
	if (event == OBS_FRONTEND_EVENT_STREAMING_STARTED)
		control->set_streaming(true);
	else if (event == OBS_FRONTEND_EVENT_STREAMING_STOPPED)
		control->set_streaming(false);
}

const char *obs_module_description(void)
{
	return "Secure VISP remote start and stop control for OBS streaming";
}

bool obs_module_load(void)
{
	obs_frontend_add_event_callback(frontend_event, NULL);
	obs_frontend_add_tools_menu_item("VISP Remote Control", open_settings, NULL);
	apply_config(load_config());
	obs_log(LOG_INFO, "plugin loaded successfully (version %s)", PLUGIN_VERSION);
	return true;
}

void obs_module_unload(void)
{
	obs_frontend_remove_event_callback(frontend_event, NULL);
	delete control;
	control = NULL;
	obs_log(LOG_INFO, "plugin unloaded");
}

#endif
