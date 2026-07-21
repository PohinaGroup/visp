#include <QByteArray>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QList>
#include <QString>
#include <QStringList>
#include <QUrl>
#include <cmath>
#include <cstdint>

struct control_response {
	uint64_t command_version;
	bool desired_streaming;
	QString desired_scene;
};

struct publishing_device {
	qint64 id;
	QString label;
	bool publishing;
};

struct devices_response {
	QString handle;
	QList<publishing_device> devices;
};

struct device_code_response {
	QString device_code;
	QString user_code;
	QUrl verification_url;
	int expires_in;
	int interval;
};

struct device_token_response {
	QString access_token;
};

enum class device_poll_state { token, pending, slow_down, terminal };

struct connection_response {
	QString control_url;
	QString token;
	QString handle;
};

struct media_source_response {
	qint64 path_id;
	QString name;
	QString id;
	QJsonObject settings;
};

struct created_device_response {
	qint64 path_id;
	QString label;
	QString srt_url;
};

static bool positive_integer(const QJsonValue &value, qint64 *result)
{
	const double number = value.toDouble(-1);
	if (!value.isDouble() || number < 1 || std::floor(number) != number)
		return false;
	*result = static_cast<qint64>(number);
	return true;
}

static bool parse_devices_response(const QByteArray &json, struct devices_response *response)
{
	const QJsonDocument document = QJsonDocument::fromJson(json);
	if (!document.isObject())
		return false;
	const QJsonObject object = document.object();
	const QJsonObject account = object.value("account").toObject();
	const QJsonArray devices = object.value("devices").toArray();
	if (!object.value("account").isObject() || !account.value("handle").isString() ||
	    !object.value("devices").isArray())
		return false;
	QList<publishing_device> parsed;
	for (const QJsonValue value : devices) {
		const QJsonObject item = value.toObject();
		publishing_device device = {};
		if (!value.isObject() || !positive_integer(item.value("id"), &device.id) ||
		    !item.value("label").isString() || !item.value("publishing").isBool())
			return false;
		device.label = item.value("label").toString();
		device.publishing = item.value("publishing").toBool();
		parsed.append(device);
	}
	response->handle = account.value("handle").toString();
	response->devices = parsed;
	return true;
}

static bool parse_device_code_response(const QByteArray &json, struct device_code_response *response)
{
	const QJsonDocument document = QJsonDocument::fromJson(json);
	if (!document.isObject())
		return false;
	const QJsonObject object = document.object();
	const QUrl verification(object.value("verification_uri_complete").toString());
	const int expires = object.value("expires_in").toInt(0);
	const int interval = object.value("interval").toInt(0);
	const bool local_http = verification.scheme() == "http" &&
				(verification.host() == "localhost" || verification.host() == "127.0.0.1" ||
				 verification.host() == "::1");
	if (!object.value("device_code").isString() || !object.value("user_code").isString() ||
	    !verification.isValid() || (verification.scheme() != "https" && !local_http) || expires < 1 ||
	    interval < 1)
		return false;
	response->device_code = object.value("device_code").toString();
	response->user_code = object.value("user_code").toString();
	response->verification_url = verification;
	response->expires_in = expires;
	response->interval = interval;
	return true;
}

static bool parse_device_token_response(const QByteArray &json, struct device_token_response *response)
{
	const QJsonDocument document = QJsonDocument::fromJson(json);
	if (!document.isObject() || !document.object().value("access_token").isString())
		return false;
	response->access_token = document.object().value("access_token").toString();
	return !response->access_token.isEmpty();
}

static device_poll_state parse_device_poll_response(int status, const QByteArray &json,
					     struct device_token_response *response)
{
	if (status >= 200 && status < 300)
		return parse_device_token_response(json, response) ? device_poll_state::token : device_poll_state::terminal;
	const QString error = QJsonDocument::fromJson(json).object().value("error").toString();
	if (error == "authorization_pending")
		return device_poll_state::pending;
	if (error == "slow_down")
		return device_poll_state::slow_down;
	return device_poll_state::terminal;
}

static bool device_poll_expired(qint64 now, qint64 expires_at)
{
	return now >= expires_at;
}

static bool parse_connection_response(const QByteArray &json, struct connection_response *response)
{
	const QJsonDocument document = QJsonDocument::fromJson(json);
	if (!document.isObject())
		return false;
	const QJsonObject object = document.object();
	const QJsonObject account = object.value("account").toObject();
	if (!object.value("controlUrl").isString() || !object.value("token").isString() ||
	    !object.value("account").isObject() || !account.value("handle").isString())
		return false;
	response->control_url = object.value("controlUrl").toString();
	response->token = object.value("token").toString();
	response->handle = account.value("handle").toString();
	return !response->control_url.isEmpty() && !response->token.isEmpty();
}

static bool parse_media_source_response(const QByteArray &json, struct media_source_response *response)
{
	const QJsonDocument document = QJsonDocument::fromJson(json);
	if (!document.isObject())
		return false;
	const QJsonObject object = document.object();
	const QJsonObject source = object.value("source").toObject();
	if (!positive_integer(object.value("pathId"), &response->path_id) ||
	    !object.value("source").isObject() || !source.value("name").isString() ||
	    source.value("id").toString() != "ffmpeg_source" || !source.value("settings").isObject())
		return false;
	response->name = source.value("name").toString();
	response->id = source.value("id").toString();
	response->settings = source.value("settings").toObject();
	return !response->name.isEmpty();
}

static bool parse_created_device_response(const QByteArray &json, struct created_device_response *response)
{
	const QJsonDocument document = QJsonDocument::fromJson(json);
	if (!document.isObject())
		return false;
	const QJsonObject object = document.object();
	const QJsonObject path = object.value("path").toObject();
	const QJsonObject urls = object.value("urls").toObject();
	if (!object.value("path").isObject() || !object.value("urls").isObject() ||
	    !positive_integer(path.value("id"), &response->path_id) || !path.value("label").isString() ||
	    !urls.value("srt").isString())
		return false;
	response->label = path.value("label").toString();
	response->srt_url = urls.value("srt").toString();
	return !response->srt_url.isEmpty();
}

static bool parse_control_response(const QByteArray &json, struct control_response *response)
{
	QJsonParseError error;
	const QJsonDocument document = QJsonDocument::fromJson(json, &error);
	if (error.error != QJsonParseError::NoError || !document.isObject())
		return false;
	const QJsonObject object = document.object();
	const QJsonValue version_value = object.value("commandVersion");
	const QJsonValue streaming_value = object.value("desiredStreaming");
	const QJsonValue scene_value = object.value("desiredScene");
	const double version = version_value.toDouble(-1);
	if (!version_value.isDouble() || version < 0 || std::floor(version) != version ||
	    !streaming_value.isBool() || (!scene_value.isNull() && !scene_value.isString()))
		return false;
	response->command_version = static_cast<uint64_t>(version);
	response->desired_streaming = streaming_value.toBool();
	response->desired_scene = scene_value.isString() ? scene_value.toString() : QString();
	return true;
}

static QByteArray make_control_request(bool streaming, uint64_t applied_version, const QStringList &scene_names,
				       const QString &current_scene)
{
	QJsonArray scenes;
	for (const QString &name : scene_names)
		scenes.append(name);
	const QJsonObject payload{
		{"streaming", streaming},
		{"appliedVersion", static_cast<qint64>(applied_version)},
		{"scenes", scenes},
		{"currentScene", current_scene.isNull() ? QJsonValue(QJsonValue::Null) : QJsonValue(current_scene)},
	};
	return QJsonDocument(payload).toJson(QJsonDocument::Compact);
}

#ifdef VISP_PROTOCOL_TEST

#include <cstdio>
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
	CHECK(parse_control_response("{\"commandVersion\":7,\"desiredStreaming\":true,\"desiredScene\":\"Main \\\"台\\\"\",\"pollAfterMs\":2000}",
				     &response));
	CHECK(response.command_version == 7 && response.desired_streaming &&
	      response.desired_scene == QString::fromUtf8("Main \"台\""));
	CHECK(parse_control_response("{\"desiredStreaming\":false,\"desiredScene\":null,\"commandVersion\":8}",
				     &response));
	CHECK(response.command_version == 8 && !response.desired_streaming && response.desired_scene.isNull());
	CHECK(!parse_control_response("{\"commandVersion\":9}", &response));
	const QJsonObject first_poll = QJsonDocument::fromJson(
		make_control_request(false, 8, {"Old scene", "Removed scene"}, QString()))
					       .object();
	CHECK(first_poll.value("currentScene").isNull());
	CHECK(first_poll.value("scenes").toArray().size() == 2);
	const QJsonObject renamed_poll = QJsonDocument::fromJson(
		make_control_request(true, 9, {QString::fromUtf8("Main \"台\""), "Renamed scene"}, "Renamed scene"))
					         .object();
	CHECK(renamed_poll.value("currentScene").toString() == "Renamed scene");
	CHECK(renamed_poll.value("scenes").toArray().at(0).toString() == QString::fromUtf8("Main \"台\""));
	CHECK(!renamed_poll.value("scenes").toArray().contains("Removed scene"));
	struct devices_response devices = {};
	CHECK(parse_devices_response(
		"{\"account\":{\"handle\":\"streamer\"},\"devices\":[{\"id\":1,\"label\":\"Phone\",\"publishing\":true}]}",
		&devices));
	CHECK(devices.handle == "streamer" && devices.devices.size() == 1 && devices.devices.at(0).id == 1 &&
	      devices.devices.at(0).publishing);
	CHECK(!parse_devices_response("{\"account\":{},\"devices\":[]}", &devices));
	struct device_code_response code = {};
	CHECK(parse_device_code_response(
		"{\"device_code\":\"secret\",\"user_code\":\"ABCD-1234\",\"verification_uri_complete\":\"https://visp.example/device?user_code=ABCD-1234\",\"expires_in\":1800,\"interval\":5}",
		&code));
	CHECK(code.interval == 5 && code.user_code == "ABCD-1234");
	CHECK(!parse_device_code_response(
		"{\"device_code\":\"secret\",\"user_code\":\"ABCD\",\"verification_uri_complete\":\"http://visp.example/device\",\"expires_in\":1,\"interval\":1}",
		&code));
	struct device_token_response device_token = {};
	CHECK(parse_device_token_response("{\"access_token\":\"temporary-session\"}", &device_token));
	CHECK(!parse_device_token_response("{\"error\":\"authorization_pending\"}", &device_token));
	CHECK(parse_device_poll_response(200, "{\"access_token\":\"temporary-session\"}", &device_token) ==
	      device_poll_state::token);
	CHECK(parse_device_poll_response(400, "{\"error\":\"authorization_pending\"}", &device_token) ==
	      device_poll_state::pending);
	CHECK(parse_device_poll_response(400, "{\"error\":\"slow_down\"}", &device_token) ==
	      device_poll_state::slow_down);
	CHECK(parse_device_poll_response(200, "{\"unexpected\":true}", &device_token) ==
	      device_poll_state::terminal);
	CHECK(parse_device_poll_response(400, "{\"error\":\"expired_token\"}", &device_token) ==
	      device_poll_state::terminal);
	CHECK(!device_poll_expired(999, 1000) && device_poll_expired(1000, 1000));
	struct connection_response connection = {};
	CHECK(parse_connection_response(
		"{\"account\":{\"handle\":\"streamer\"},\"controlUrl\":\"https://visp.example/api/obs/control\",\"token\":\"limited\"}",
		&connection));
	struct media_source_response source = {};
	CHECK(parse_media_source_response(
		"{\"status\":\"ready\",\"pathId\":7,\"source\":{\"name\":\"Phone feed\",\"id\":\"ffmpeg_source\",\"settings\":{\"input\":\"srt://relay\",\"visp_path_id\":\"7\"}}}",
		&source));
	CHECK(source.path_id == 7 && source.settings.value("visp_path_id").toString() == "7");
	CHECK(!parse_media_source_response(
		"{\"pathId\":7,\"source\":{\"name\":\"Bad\",\"id\":\"browser_source\",\"settings\":{}}}",
		&source));
	struct created_device_response created = {};
	CHECK(parse_created_device_response(
		"{\"path\":{\"id\":9,\"label\":\"OBS\"},\"urls\":{\"srt\":\"srt://relay/publish\",\"rtmp\":\"rtmp://relay\"}}",
		&created));
	CHECK(created.path_id == 9 && created.label == "OBS");
	return 0;
}

#else

#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QDateTime>
#include <QDesktopServices>
#include <QDialog>
#include <QDialogButtonBox>
#include <QFileDialog>
#include <QFormLayout>
#include <QHBoxLayout>
#include <QLabel>
#include <QLineEdit>
#include <QMessageBox>
#include <QObject>
#include <QPushButton>
#include <QScrollArea>
#include <QSettings>
#include <QTimer>
#include <QVBoxLayout>
#include <QWidget>
#include <functional>
#include <obs-frontend-api.h>
#include <obs-hotkey.h>
#include <obs-module.h>
#include <plugin-support.h>
#include <util/config-file.h>

#define CONFIG_SECTION "visp"
#define DEFAULT_CONTROL_URL "https://visp-stream.com/api/obs/control"

OBS_DECLARE_MODULE()
OBS_MODULE_USE_DEFAULT_LOCALE(PLUGIN_NAME, "en-US")
OBS_MODULE_AUTHOR("VISP")

struct plugin_config {
	QString control_url;
	QString token;
	qint64 output_path_id = 0;
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
	result.output_path_id = config_get_int(config, CONFIG_SECTION, "output_path_id");
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
	config_set_int(config, CONFIG_SECTION, "output_path_id", settings.output_path_id);
	const bool saved = config_save_safe(config, "tmp", NULL) == CONFIG_SUCCESS;
	config_close(config);
	bfree(path);
	return saved;
}

static void apply_config(const plugin_config &settings);

static QUrl endpoint_url(const QString &control_url, const QString &path)
{
	QUrl result(control_url);
	result.setPath(path);
	result.setQuery(QString());
	result.setFragment(QString());
	return result;
}

static QString response_error(const QByteArray &body, const QString &fallback)
{
	const QJsonDocument document = QJsonDocument::fromJson(body);
	if (document.isObject()) {
		const QJsonObject object = document.object();
		for (const char *key : {"error_description", "message", "error"}) {
			if (object.value(key).isString())
				return object.value(key).toString();
		}
	}
	const QString text = QString::fromUtf8(body).trimmed();
	return text.isEmpty() ? fallback : text;
}

struct source_lookup {
	QString path_id;
	QString input;
	obs_source_t *source = nullptr;
};

static bool find_visp_source(void *private_data, obs_source_t *source)
{
	auto *lookup = static_cast<source_lookup *>(private_data);
	if (QString::fromUtf8(obs_source_get_unversioned_id(source)) != "ffmpeg_source")
		return true;
	obs_data_t *settings = obs_source_get_settings(source);
	const QString path_id = QString::fromUtf8(obs_data_get_string(settings, "visp_path_id"));
	const QString input = QString::fromUtf8(obs_data_get_string(settings, "input"));
	obs_data_release(settings);
	if ((!lookup->path_id.isEmpty() && lookup->path_id == path_id) ||
	    (!lookup->input.isEmpty() && lookup->input == input)) {
		lookup->source = obs_source_get_ref(source);
		return false;
	}
	return true;
}

static QString unique_source_name(const QString &base)
{
	for (int suffix = 1;; suffix++) {
		const QString candidate = suffix == 1 ? base : QString("%1 %2").arg(base).arg(suffix);
		obs_source_t *existing = obs_get_source_by_name(candidate.toUtf8().constData());
		if (!existing)
			return candidate;
		obs_source_release(existing);
	}
}

static bool add_media_source(const media_source_response &value, QString *error)
{
	if (value.id != "ffmpeg_source") {
		*error = "VISP returned an unsupported OBS source type.";
		return false;
	}
	const QByteArray settings_json = QJsonDocument(value.settings).toJson(QJsonDocument::Compact);
	obs_data_t *settings = obs_data_create_from_json(settings_json.constData());
	if (!settings) {
		*error = "OBS could not read the Media Source settings.";
		return false;
	}

	source_lookup lookup{QString::number(value.path_id), value.settings.value("input").toString()};
	obs_enum_sources(find_visp_source, &lookup);
	obs_source_t *source = lookup.source;
	if (source) {
		obs_source_update(source, settings);
	} else {
		const QString name = unique_source_name(value.name);
		source = obs_source_create("ffmpeg_source", name.toUtf8().constData(), settings, nullptr);
	}
	obs_data_release(settings);
	if (!source) {
		*error = "OBS could not create the Media Source.";
		return false;
	}

	obs_source_t *scene_source = obs_frontend_preview_program_mode_active()
					     ? obs_frontend_get_current_preview_scene()
					     : obs_frontend_get_current_scene();
	obs_scene_t *scene = scene_source ? obs_scene_from_source(scene_source) : nullptr;
	if (!scene) {
		if (scene_source)
			obs_source_release(scene_source);
		obs_source_release(source);
		*error = "Select an OBS scene before adding the Media Source.";
		return false;
	}
	const char *name = obs_source_get_name(source);
	if (!obs_scene_find_source(scene, name) && !obs_scene_add(scene, source)) {
		obs_source_release(scene_source);
		obs_source_release(source);
		*error = "OBS could not add the Media Source to the selected scene.";
		return false;
	}
	obs_source_release(scene_source);
	obs_source_release(source);
	return true;
}

static bool configure_obs_output(const QString &srt_url, QString *error)
{
	if (obs_frontend_streaming_active()) {
		*error = "Stop streaming before changing the OBS output.";
		return false;
	}
	const QUrl parsed(srt_url);
	if (!parsed.isValid() || parsed.scheme() != "srt" || parsed.host().isEmpty()) {
		*error = "VISP returned an invalid SRT publishing URL.";
		return false;
	}
	obs_data_t *settings = obs_data_create();
	obs_data_set_string(settings, "server", srt_url.toUtf8().constData());
	obs_data_set_string(settings, "key", "");
	obs_data_set_bool(settings, "use_auth", false);
	obs_service_t *old_service = obs_frontend_get_streaming_service();
	obs_data_t *hotkeys = old_service ? obs_hotkeys_save_service(old_service) : nullptr;
	obs_service_t *service = obs_service_create("rtmp_custom", "default_service", settings, hotkeys);
	if (hotkeys)
		obs_data_release(hotkeys);
	obs_data_release(settings);
	if (!service) {
		*error = "OBS could not create a custom SRT streaming service.";
		return false;
	}
	obs_frontend_set_streaming_service(service);
	obs_frontend_save_streaming_service();
	obs_service_release(service);
	return true;
}

class SettingsDialog final : public QDialog {
public:
	SettingsDialog(const plugin_config &settings, QWidget *parent)
		: QDialog(parent), output_path_id(settings.output_path_id), network(this), auth_timer(this)
	{
		setWindowTitle("VISP for OBS");
		setMinimumWidth(640);
		url.setText(settings.control_url.isEmpty() ? DEFAULT_CONTROL_URL : settings.control_url);
		token.setText(settings.token);
		token.setEchoMode(QLineEdit::PasswordEchoOnEdit);
		token.setPlaceholderText("Legacy pairing token");
		account_status.setWordWrap(true);
		account_status.setText(settings.token.isEmpty() ? "Not connected" : "Checking VISP account…");

		auto *sign_in = new QPushButton("Sign in with browser");
		auto *refresh = new QPushButton("Refresh devices");
		auto *disconnect_button = new QPushButton("Disconnect");
		connect(sign_in, &QPushButton::clicked, this, [this]() { begin_sign_in(); });
		connect(refresh, &QPushButton::clicked, this, [this]() { load_devices(); });
		connect(disconnect_button, &QPushButton::clicked, this, [this]() { disconnect_account(); });
		auto *account_actions = new QHBoxLayout;
		account_actions->addWidget(sign_in);
		account_actions->addWidget(refresh);
		account_actions->addWidget(disconnect_button);
		account_actions->addStretch();

		devices_layout = new QVBoxLayout(&devices_widget);
		devices_layout->setContentsMargins(0, 0, 0, 0);
		auto *scroll = new QScrollArea;
		scroll->setWidget(&devices_widget);
		scroll->setWidgetResizable(true);
		scroll->setMinimumHeight(150);

		device_label.setText("OBS");
		auto *create_button = new QPushButton("Create and use as OBS output");
		connect(create_button, &QPushButton::clicked, this, [this]() { create_output_device(); });
		auto *create_row = new QHBoxLayout;
		create_row->addWidget(&device_label, 1);
		create_row->addWidget(create_button);

		auto *form = new QFormLayout;
		form->addRow("Control URL", &url);
		form->addRow("Pairing token", &token);
		auto *import_button = new QPushButton("Import config.ini");
		connect(import_button, &QPushButton::clicked, this, [this]() { import_config(); });

		auto *buttons = new QDialogButtonBox(QDialogButtonBox::Save | QDialogButtonBox::Cancel);
		connect(buttons, &QDialogButtonBox::accepted, this, [this]() { validate_and_accept(); });
		connect(buttons, &QDialogButtonBox::rejected, this, &QDialog::reject);
		connect(&auth_timer, &QTimer::timeout, this, [this]() { poll_device_token(); });

		auto *layout = new QVBoxLayout(this);
		auto *intro = new QLabel(
			"Sign in to manage publishing devices, add relay feeds, and keep VISP remote control connected.");
		intro->setWordWrap(true);
		layout->addWidget(intro);
		layout->addWidget(&account_status);
		layout->addLayout(account_actions);
		layout->addWidget(new QLabel("Publishing devices"));
		layout->addWidget(scroll);
		layout->addWidget(new QLabel("Create a publishing device for this OBS installation"));
		layout->addLayout(create_row);
		layout->addSpacing(8);
		layout->addWidget(new QLabel("Manual / self-hosted pairing"));
		layout->addLayout(form);
		layout->addWidget(import_button, 0, Qt::AlignLeft);
		layout->addWidget(buttons);

		if (!settings.token.isEmpty())
			QTimer::singleShot(0, this, [this]() { load_devices(); });
	}

	plugin_config settings() const
	{
		return {url.text().trimmed(), token.text().trimmed(), output_path_id};
	}

private:
	using ReplyHandler = std::function<void(int, const QByteArray &)>;

	void send(const QUrl &endpoint, bool post, const QJsonObject &body, const QString &bearer,
		  ReplyHandler handler)
	{
		QNetworkRequest request(endpoint);
		request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
		request.setTransferTimeout(10'000);
		request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
		if (!bearer.isEmpty())
			request.setRawHeader("Authorization", "Bearer " + bearer.toUtf8());
		QNetworkReply *reply = post
				       ? network.post(request, QJsonDocument(body).toJson(QJsonDocument::Compact))
				       : network.get(request);
		connect(reply, &QNetworkReply::finished, this, [reply, handler = std::move(handler)]() {
			const int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
			const QByteArray response = reply->readAll();
			handler(status, response);
			reply->deleteLater();
		});
	}

	void clear_devices()
	{
		while (QLayoutItem *item = devices_layout->takeAt(0)) {
			delete item->widget();
			delete item;
		}
	}

	void render_devices(const devices_response &response)
	{
		clear_devices();
		account_status.setText(QString("Connected as %1").arg(response.handle));
		if (response.devices.isEmpty()) {
			devices_layout->addWidget(new QLabel("No publishing devices yet."));
			return;
		}
		for (const publishing_device &device : response.devices) {
			auto *row = new QWidget;
			auto *row_layout = new QHBoxLayout(row);
			row_layout->setContentsMargins(0, 0, 0, 0);
			row_layout->addWidget(new QLabel(
				QString("%1 — %2").arg(device.label, device.publishing ? "live" : "offline")),
				1);
			auto *button = new QPushButton(device.id == output_path_id ? "This OBS output" : "Add to scene");
			button->setEnabled(device.id != output_path_id);
			connect(button, &QPushButton::clicked, this,
				[this, id = device.id]() { request_media_source(id); });
			row_layout->addWidget(button);
			devices_layout->addWidget(row);
		}
	}

	void load_devices()
	{
		const plugin_config value = settings();
		if (value.token.isEmpty() || !secure_url(value.control_url)) {
			account_status.setText("Sign in or enter a valid pairing token.");
			clear_devices();
			return;
		}
		account_status.setText("Loading publishing devices…");
		send(endpoint_url(value.control_url, "/api/obs/devices"), false, {}, value.token,
		     [this](int status, const QByteArray &body) {
			     devices_response response;
			     if (status >= 200 && status < 300 && parse_devices_response(body, &response)) {
				     render_devices(response);
				     return;
			     }
			     clear_devices();
			     account_status.setText(status == 401 ? "Pairing rejected. Sign in again."
							  : response_error(body, "Could not load publishing devices."));
		     });
	}

	void begin_sign_in()
	{
		const QString control_url = url.text().trimmed();
		if (!secure_url(control_url)) {
			QMessageBox::warning(this, "Invalid control URL", "Use an HTTPS URL (or HTTP on localhost).");
			return;
		}
		auth_timer.stop();
		token.clear();
		clear_devices();
		account_status.setText("Starting browser sign-in…");
		send(endpoint_url(control_url, "/api/auth/device/code"), true,
		     {{"client_id", "visp-obs"}, {"scope", "obs"}}, {},
		     [this](int status, const QByteArray &body) {
			     device_code_response response;
			     if (status < 200 || status >= 300 || !parse_device_code_response(body, &response)) {
				     account_status.setText(response_error(body, "Could not start browser sign-in."));
				     return;
			     }
			     auth_device_code = response.device_code;
			     auth_interval = response.interval;
			     auth_expires_at = QDateTime::currentMSecsSinceEpoch() + qint64(response.expires_in) * 1000;
			     account_status.setText(QString("Approve code %1 in your browser.").arg(response.user_code));
			     if (!QDesktopServices::openUrl(response.verification_url))
				     account_status.setText(QString("Open %1 and approve code %2.")
								    .arg(response.verification_url.toString(), response.user_code));
			     auth_timer.start(auth_interval * 1000);
		     });
	}

	void poll_device_token()
	{
		if (device_poll_expired(QDateTime::currentMSecsSinceEpoch(), auth_expires_at)) {
			auth_timer.stop();
			account_status.setText("Browser sign-in expired. Try again.");
			return;
		}
		auth_timer.stop();
		send(endpoint_url(url.text().trimmed(), "/api/auth/device/token"), true,
		     {{"grant_type", "urn:ietf:params:oauth:grant-type:device_code"},
		      {"device_code", auth_device_code},
		      {"client_id", "visp-obs"}},
		     {}, [this](int status, const QByteArray &body) {
			     device_token_response response;
			     switch (parse_device_poll_response(status, body, &response)) {
			     case device_poll_state::token:
				     exchange_session(response.access_token);
				     break;
			     case device_poll_state::pending:
				     auth_timer.start(auth_interval * 1000);
				     break;
			     case device_poll_state::slow_down:
				     auth_interval += 5;
				     auth_timer.start(auth_interval * 1000);
				     break;
			     case device_poll_state::terminal:
				     account_status.setText(response_error(body, "Browser sign-in failed."));
				     break;
			     }
		     });
	}

	void exchange_session(const QString &access_token)
	{
		account_status.setText("Finishing VISP connection…");
		send(endpoint_url(url.text().trimmed(), "/api/obs/connect"), true, {}, access_token,
		     [this](int status, const QByteArray &body) {
			     connection_response response;
			     if (status < 200 || status >= 300 || !parse_connection_response(body, &response) ||
				 !secure_url(response.control_url)) {
				     account_status.setText(response_error(body, "Could not finish VISP connection."));
				     return;
			     }
			     url.setText(response.control_url);
			     token.setText(response.token);
			     output_path_id = 0;
			     if (!persist_current_settings("VISP connected, but OBS could not save the credential."))
				     return;
			     account_status.setText(QString("Connected as %1").arg(response.handle));
			     load_devices();
		     });
	}

	void disconnect_account()
	{
		const plugin_config value = settings();
		if (value.token.isEmpty()) {
			clear_local_account();
			return;
		}
		send(endpoint_url(value.control_url, "/api/obs/disconnect"), true, {}, value.token,
		     [this](int status, const QByteArray &body) {
			     if (status >= 200 && status < 300) {
				     clear_local_account();
				     return;
			     }
			     QMessageBox::warning(this, "Disconnect failed",
						  response_error(body, "Could not disconnect this OBS plugin."));
		     });
	}

	void clear_local_account()
	{
		auth_timer.stop();
		token.clear();
		output_path_id = 0;
		clear_devices();
		account_status.setText("Not connected");
		persist_current_settings("OBS could not save the disconnected state.");
	}

	void request_media_source(qint64 path_id)
	{
		const plugin_config value = settings();
		send(endpoint_url(value.control_url, QString("/api/obs/devices/%1/source").arg(path_id)), true,
		     {}, value.token, [this](int status, const QByteArray &body) {
			     media_source_response response;
			     if (status < 200 || status >= 300 || !parse_media_source_response(body, &response)) {
				     QMessageBox::warning(this, "Could not add Media Source",
						  response_error(body, "VISP returned an invalid Media Source."));
				     return;
			     }
			     QString error;
			     if (!add_media_source(response, &error)) {
				     QMessageBox::warning(this, "Could not add Media Source", error);
				     return;
			     }
			     QMessageBox::information(this, "Media Source added",
						      "The VISP feed is ready in the selected scene.");
		     });
	}

	void create_output_device()
	{
		const plugin_config value = settings();
		const QString label = device_label.text().trimmed();
		if (value.token.isEmpty() || label.isEmpty()) {
			QMessageBox::warning(this, "Missing details", "Connect VISP and enter a device name first.");
			return;
		}
		if (obs_frontend_streaming_active()) {
			QMessageBox::warning(this, "OBS is streaming", "Stop streaming before changing the output.");
			return;
		}
		if (QMessageBox::question(
			    this, "Replace OBS stream destination",
			    QString("Create ‘%1’ in VISP and replace this OBS profile's current streaming service and key?")
				    .arg(label)) != QMessageBox::Yes)
			return;
		send(endpoint_url(value.control_url, "/api/obs/devices"), true, {{"label", label}}, value.token,
		     [this](int status, const QByteArray &body) {
			     created_device_response response;
			     if (status < 200 || status >= 300 || !parse_created_device_response(body, &response)) {
				     QMessageBox::warning(this, "Could not create publishing device",
						  response_error(body, "VISP returned an invalid device."));
				     return;
			     }
			     QString error;
			     while (!configure_obs_output(response.srt_url, &error)) {
				     if (QMessageBox::warning(
						 this, "Publishing device created",
						 QString("VISP created ‘%1’, but OBS setup failed: %2")
							 .arg(response.label, error),
						 QMessageBox::Retry | QMessageBox::Close) != QMessageBox::Retry)
					     return;
			     }
			     output_path_id = response.path_id;
			     persist_current_settings("OBS output is configured, but its VISP device ID could not be saved.");
			     QMessageBox::information(this, "OBS output configured",
						      QString("OBS now publishes to VISP as ‘%1’.").arg(response.label));
			     load_devices();
		     });
	}

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
		output_path_id = 0;
		load_devices();
	}

	void validate_and_accept()
	{
		if (!secure_url(url.text().trimmed())) {
			QMessageBox::warning(this, "Invalid control URL", "Use an HTTPS URL (or HTTP on localhost).");
			return;
		}
		accept();
	}

	bool persist_current_settings(const QString &error_message)
	{
		const plugin_config value = settings();
		if (!save_config(value)) {
			QMessageBox::warning(this, "VISP for OBS", error_message);
			return false;
		}
		apply_config(value);
		return true;
	}

	qint64 output_path_id;
	QLineEdit url;
	QLineEdit token;
	QLabel account_status;
	QWidget devices_widget;
	QVBoxLayout *devices_layout = nullptr;
	QLineEdit device_label;
	QNetworkAccessManager network;
	QTimer auth_timer;
	QString auth_device_code;
	int auth_interval = 5;
	qint64 auth_expires_at = 0;
};

static QStringList scene_names()
{
	QStringList names;
	struct obs_frontend_source_list scenes = {};
	obs_frontend_get_scenes(&scenes);
	for (size_t index = 0; index < scenes.sources.num; index++)
		names.append(QString::fromUtf8(obs_source_get_name(scenes.sources.array[index])));
	obs_frontend_source_list_free(&scenes);
	return names;
}

static QString current_scene_name()
{
	obs_source_t *scene = obs_frontend_get_current_scene();
	if (!scene)
		return {};
	const QString name = QString::fromUtf8(obs_source_get_name(scene));
	obs_source_release(scene);
	return name;
}

static bool set_current_scene(const QString &name)
{
	struct obs_frontend_source_list scenes = {};
	obs_frontend_get_scenes(&scenes);
	bool found = false;
	for (size_t index = 0; index < scenes.sources.num; index++) {
		obs_source_t *scene = scenes.sources.array[index];
		if (name == QString::fromUtf8(obs_source_get_name(scene))) {
			obs_frontend_set_current_scene(scene);
			found = true;
			break;
		}
	}
	obs_frontend_source_list_free(&scenes);
	return found;
}

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
		const QByteArray body = make_control_request(streaming, applied_version, scene_names(), current_scene_name());
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
		if (!parse_control_response(body, &response)) {
			obs_log(LOG_WARNING, "control service returned an invalid response");
			return;
		}

		if (response.command_version <= applied_version)
			return;
		if (!response.desired_scene.isNull() && !set_current_scene(response.desired_scene)) {
			obs_log(LOG_WARNING, "requested scene is no longer available: %s",
				response.desired_scene.toUtf8().constData());
			return;
		}
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
