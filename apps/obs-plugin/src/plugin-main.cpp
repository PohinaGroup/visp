#include <QByteArray>
#include <QCryptographicHash>
#include <QDateTime>
#include <QDir>
#include <QHash>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QList>
#include <QSet>
#include <QString>
#include <QStringDecoder>
#include <QStringList>
#include <QUrl>
#include <QUrlQuery>
#include <QUuid>
#include <cmath>
#include <cstdint>

struct control_response {
	uint64_t command_version;
	bool desired_streaming;
	bool desired_recording;
	bool desired_virtual_cam;
	bool desired_replay_buffer;
	bool desired_record_paused;
	QString desired_scene;
};

struct ticket_response {
	QString ticket;
	QDateTime expires_at;
};

enum class websocket_parse_result { incomplete, text, close, ping, pong, error };

struct websocket_frame {
	websocket_parse_result result = websocket_parse_result::incomplete;
	QByteArray payload;
	qsizetype consumed = 0;
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

enum class control_connection_state {
	inactive,
	connecting,
	connected,
	reconnecting,
	sign_in_required,
};

enum class ticket_request_outcome { accepted, retryable, sign_in_required };

struct account_presentation {
	QString identity;
	QString connection_message;
	bool can_sign_in;
	bool can_retry;
	bool can_disconnect;
};

enum class output_setup_state { not_configured, configured, configured_device_missing };

struct output_presentation {
	output_setup_state state;
	QString label;
	bool can_configure;
};

static ticket_request_outcome classify_ticket_outcome(int status, bool transport_ok, bool valid_ticket)
{
	if (status == 401)
		return ticket_request_outcome::sign_in_required;
	if (transport_ok && status >= 200 && status < 300 && valid_ticket)
		return ticket_request_outcome::accepted;
	return ticket_request_outcome::retryable;
}

static account_presentation present_account(const QString &identity, bool has_credential,
					    control_connection_state state)
{
	account_presentation result{
		identity.isEmpty() ? (has_credential ? "Checking VISP account..." : "Not signed in") : identity,
		{}, true, false, has_credential};
	switch (state) {
	case control_connection_state::inactive:
		result.connection_message = has_credential ? "Live control is offline." : "Live control is inactive.";
		result.can_retry = has_credential;
		break;
	case control_connection_state::connecting:
		result.connection_message = "Connecting live control...";
		break;
	case control_connection_state::connected:
		result.connection_message = "Live control connected.";
		break;
	case control_connection_state::reconnecting:
		result.connection_message = "Live control is offline; reconnecting...";
		result.can_retry = has_credential;
		break;
	case control_connection_state::sign_in_required:
		result.connection_message = "Sign in again to restore live control.";
		result.can_retry = has_credential;
		break;
	}
	return result;
}

static output_presentation present_output(qint64 output_path_id, const QList<publishing_device> &devices,
					  bool has_credential, bool streaming)
{
	if (output_path_id <= 0)
		return {output_setup_state::not_configured, "This OBS profile is not configured for VISP.",
			has_credential && !streaming};
	for (const publishing_device &device : devices) {
		if (device.id == output_path_id)
			return {output_setup_state::configured, QString("Publishing as %1.").arg(device.label),
				has_credential && !streaming};
	}
	return {output_setup_state::configured_device_missing,
		"The saved VISP output device is no longer available.", has_credential && !streaming};
}

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
	// Open the page without the code: the user types the code OBS shows, so a
	// link carrying someone else's code is never enough to approve it.
	const QUrl verification(object.value("verification_uri").toString());
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

/* Better Auth's eight-character codes read more easily as ABCD-EFGH; the
 * approval page ignores case and dashes. */
static QString format_user_code(const QString &code)
{
	return code.size() == 8 ? code.left(4) + "-" + code.mid(4) : code;
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
	// New toggle intents default to false so an older server that omits them
	// leaves recording/virtual-cam/replay untouched.
	response->desired_recording = object.value("desiredRecording").toBool(false);
	response->desired_virtual_cam = object.value("desiredVirtualCam").toBool(false);
	response->desired_replay_buffer = object.value("desiredReplayBuffer").toBool(false);
	response->desired_record_paused = object.value("desiredRecordPaused").toBool(false);
	response->desired_scene = scene_value.isString() ? scene_value.toString() : QString();
	return true;
}

static bool parse_ticket_response(const QByteArray &json, struct ticket_response *response)
{
	const QJsonDocument document = QJsonDocument::fromJson(json);
	if (!document.isObject())
		return false;
	const QJsonObject object = document.object();
	if (!object.value("ticket").isString() || !object.value("expiresAt").isString())
		return false;
	response->ticket = object.value("ticket").toString();
	response->expires_at = QDateTime::fromString(object.value("expiresAt").toString(), Qt::ISODateWithMs);
	if (!response->expires_at.isValid())
		response->expires_at = QDateTime::fromString(object.value("expiresAt").toString(), Qt::ISODate);
	return !response->ticket.isEmpty() && response->expires_at.isValid();
}

static QUrl live_websocket_url(const QString &control_url, const QString &ticket)
{
	QUrl result(control_url);
	const bool local_http = result.scheme() == "http" &&
				(result.host() == "localhost" || result.host() == "127.0.0.1" || result.host() == "::1");
	if (!result.isValid() || ticket.isEmpty() || (result.scheme() != "https" && !local_http))
		return {};
	result.setScheme(result.scheme() == "https" ? "wss" : "ws");
	result.setPath("/api/obs/live");
	QUrlQuery query;
	query.addQueryItem("ticket", ticket);
	result.setQuery(query);
	result.setFragment({});
	return result;
}

static QByteArray websocket_accept(const QByteArray &key)
{
	return QCryptographicHash::hash(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11", QCryptographicHash::Sha1)
		.toBase64();
}

static bool header_has_token(const QByteArray &value, const QByteArray &wanted)
{
	for (const QByteArray &token : value.split(',')) {
		if (token.trimmed().compare(wanted, Qt::CaseInsensitive) == 0)
			return true;
	}
	return false;
}

static bool valid_websocket_handshake(const QByteArray &headers, const QByteArray &key)
{
	const QList<QByteArray> lines = headers.split('\n');
	const QList<QByteArray> status = lines.isEmpty() ? QList<QByteArray>() : lines.first().trimmed().split(' ');
	if (status.size() < 2 || status.at(0) != "HTTP/1.1" || status.at(1) != "101")
		return false;
	QByteArray upgrade;
	QByteArray connection;
	QByteArray accept;
	for (qsizetype index = 1; index < lines.size(); index++) {
		const QByteArray line = lines.at(index).trimmed();
		const qsizetype separator = line.indexOf(':');
		if (line.isEmpty())
			break;
		if (separator < 1)
			return false;
		const QByteArray name = line.first(separator).trimmed().toLower();
		const QByteArray value = line.sliced(separator + 1).trimmed();
		if (name == "upgrade")
			upgrade += (upgrade.isEmpty() ? "" : ",") + value;
		else if (name == "connection")
			connection += (connection.isEmpty() ? "" : ",") + value;
		else if (name == "sec-websocket-accept")
			accept = value;
	}
	return header_has_token(upgrade, "websocket") && header_has_token(connection, "upgrade") &&
	       accept == websocket_accept(key);
}

static QByteArray make_websocket_frame(quint8 opcode, const QByteArray &payload, quint32 mask)
{
	QByteArray frame;
	frame.append(char(0x80 | opcode));
	const quint64 size = static_cast<quint64>(payload.size());
	if (size < 126) {
		frame.append(char(0x80 | size));
	} else if (size <= 0xffff) {
		frame.append(char(0x80 | 126));
		frame.append(char(size >> 8));
		frame.append(char(size));
	} else {
		frame.append(char(0x80 | 127));
		for (int shift = 56; shift >= 0; shift -= 8)
			frame.append(char(size >> shift));
	}
	const char mask_bytes[] = {char(mask >> 24), char(mask >> 16), char(mask >> 8), char(mask)};
	frame.append(mask_bytes, 4);
	for (qsizetype index = 0; index < payload.size(); index++)
		frame.append(char(payload.at(index) ^ mask_bytes[index % 4]));
	return frame;
}

static websocket_frame parse_websocket_frame(const QByteArray &data, quint64 maximum_payload = 64 * 1024)
{
	websocket_frame result;
	if (data.size() < 2)
		return result;
	const quint8 first = static_cast<quint8>(data.at(0));
	const quint8 second = static_cast<quint8>(data.at(1));
	const quint8 opcode = first & 0x0f;
	if ((first & 0x70) || !(first & 0x80) || (second & 0x80) ||
	    (opcode != 1 && opcode != 8 && opcode != 9 && opcode != 10)) {
		result.result = websocket_parse_result::error;
		return result;
	}
	quint64 size = second & 0x7f;
	qsizetype offset = 2;
	if (size == 126) {
		if (data.size() < 4)
			return result;
		size = (static_cast<quint8>(data.at(2)) << 8) | static_cast<quint8>(data.at(3));
		offset = 4;
		if (size < 126)
			result.result = websocket_parse_result::error;
	} else if (size == 127) {
		if (data.size() < 10)
			return result;
		size = 0;
		for (int index = 2; index < 10; index++)
			size = (size << 8) | static_cast<quint8>(data.at(index));
		offset = 10;
		if (size < 65536 || (size >> 63))
			result.result = websocket_parse_result::error;
	}
	if (result.result == websocket_parse_result::error || size > maximum_payload ||
	    (opcode >= 8 && size > 125) || (opcode == 8 && size == 1)) {
		result.result = websocket_parse_result::error;
		return result;
	}
	if (size > static_cast<quint64>(data.size() - offset))
		return result;
	result.payload = data.sliced(offset, static_cast<qsizetype>(size));
	if (opcode == 1 || (opcode == 8 && size > 2)) {
		QStringDecoder decoder(QStringDecoder::Utf8);
		decoder.decode(opcode == 1 ? result.payload : result.payload.sliced(2));
		if (decoder.hasError()) {
			result.result = websocket_parse_result::error;
			return result;
		}
	}
	if (opcode == 8 && size >= 2) {
		const quint16 code = (static_cast<quint8>(result.payload.at(0)) << 8) |
				     static_cast<quint8>(result.payload.at(1));
		if (code < 1000 || code >= 5000 || code == 1004 || code == 1005 || code == 1006 ||
		    (code >= 1015 && code < 3000)) {
			result.result = websocket_parse_result::error;
			return result;
		}
	}
	result.consumed = offset + static_cast<qsizetype>(size);
	result.result = opcode == 1   ? websocket_parse_result::text
			: opcode == 8 ? websocket_parse_result::close
			: opcode == 9 ? websocket_parse_result::ping
				      : websocket_parse_result::pong;
	return result;
}

static QByteArray make_control_request(bool streaming, bool recording, bool virtual_cam, bool replay_buffer,
				       bool record_paused, uint64_t applied_version, const QStringList &scene_names,
				       const QString &current_scene)
{
	QJsonArray scenes;
	for (const QString &name : scene_names)
		scenes.append(name);
	const QJsonObject payload{
		{"streaming", streaming},
		{"recording", recording},
		{"virtualCam", virtual_cam},
		{"replayBuffer", replay_buffer},
		{"recordPaused", record_paused},
		{"appliedVersion", static_cast<qint64>(applied_version)},
		{"scenes", scenes},
		{"currentScene", current_scene.isNull() ? QJsonValue(QJsonValue::Null) : QJsonValue(current_scene)},
	};
	return QJsonDocument(payload).toJson(QJsonDocument::Compact);
}

struct restore_file {
	QString path;
	QString original_path;
	qint64 byte_size = 0;
	QByteArray sha256;
};

struct restore_manifest {
	int version = 0;
	QString os;
	QString obs_version;
	QString scene_collection;
	QString profile;
	QList<restore_file> files;
};

struct backup_summary {
	QString id;
	QDateTime completed_at;
	qint64 file_count = 0;
	qint64 total_bytes = 0;
	QString label;
	QString os;
};

static QString current_os_name()
{
#if defined(_WIN32)
	return "windows";
#elif defined(__APPLE__)
	return "macos";
#else
	return "linux";
#endif
}

// Mirrors validObsBackupPath on the server so a hostile manifest cannot escape the restore folder.
static bool valid_backup_path(const QString &path)
{
	if (path.isEmpty() || path.size() > 512 || path.contains('\\') || path.contains(QChar(0)))
		return false;
	for (const QString &part : path.split('/')) {
		if (part.isEmpty() || part == "." || part == "..")
			return false;
	}
	return true;
}

static bool valid_sha256(const QString &value)
{
	if (value.size() != 64)
		return false;
	for (const QChar character : value) {
		if (!((character >= '0' && character <= '9') || (character >= 'a' && character <= 'f')))
			return false;
	}
	return true;
}

// Version 1 came from plugins before restore existed; version 2 adds hashes and OBS details.
static bool parse_backup_manifest(const QJsonObject &object, struct restore_manifest *result)
{
	const QJsonValue version = object.value("version");
	const QJsonValue files = object.value("files");
	if (!version.isDouble() || (version.toInt() != 1 && version.toInt() != 2) || !files.isArray())
		return false;
	restore_manifest parsed;
	parsed.version = version.toInt();
	parsed.os = object.value("os").toString();
	parsed.obs_version = object.value("obsVersion").toString();
	parsed.scene_collection = object.value("sceneCollection").toString();
	parsed.profile = object.value("profile").toString();
	QSet<QString> seen;
	for (const QJsonValue value : files.toArray()) {
		const QJsonObject item = value.toObject();
		restore_file file;
		file.path = item.value("path").toString();
		file.original_path = item.value("originalPath").toString();
		if (!value.isObject() || !valid_backup_path(file.path) || file.path == "manifest.json" ||
		    seen.contains(file.path) || !item.value("originalPath").isString() ||
		    !positive_integer(item.value("byteSize"), &file.byte_size) ||
		    file.byte_size > 4LL * 1024 * 1024 * 1024)
			return false;
		const QString hash = item.value("sha256").toString().toLower();
		if (!hash.isEmpty() && !valid_sha256(hash))
			return false;
		if (hash.isEmpty() && parsed.version == 2)
			return false;
		file.sha256 = hash.toLatin1();
		seen.insert(file.path);
		parsed.files.append(file);
	}
	if (parsed.files.isEmpty())
		return false;
	*result = parsed;
	return true;
}

static bool parse_backup_list(const QByteArray &json, QList<backup_summary> *result)
{
	const QJsonDocument document = QJsonDocument::fromJson(json);
	if (!document.isObject() || !document.object().value("backups").isArray())
		return false;
	QList<backup_summary> parsed;
	for (const QJsonValue value : document.object().value("backups").toArray()) {
		const QJsonObject item = value.toObject();
		backup_summary backup;
		backup.id = item.value("id").toString();
		backup.completed_at = QDateTime::fromString(item.value("completedAt").toString(), Qt::ISODateWithMs);
		backup.file_count = item.value("fileCount").toInteger();
		backup.total_bytes = item.value("totalBytes").toInteger();
		backup.label = item.value("label").toString();
		backup.os = item.value("os").toString();
		if (!value.isObject() || QUuid::fromString(backup.id).isNull() || !backup.completed_at.isValid())
			return false;
		parsed.append(backup);
	}
	*result = parsed;
	return true;
}

// Backups may come from another OS, where QDir::fromNativeSeparators would leave backslashes alone.
static QString portable_path(const QString &path)
{
	QString result = path;
	return result.replace('\\', '/');
}

// Lowercase alphanumeric only, so a restored file name can never smuggle in a path.
static QString media_suffix(const QString &path)
{
	const QString name = portable_path(path).section('/', -1);
	const qsizetype dot = name.lastIndexOf('.');
	if (dot <= 0 || dot == name.size() - 1 || name.size() - dot - 1 > 10)
		return {};
	const QString suffix = name.sliced(dot + 1).toLower();
	for (const QChar character : suffix) {
		if (!((character >= '0' && character <= '9') || (character >= 'a' && character <= 'z')))
			return {};
	}
	return suffix;
}

static QString backup_media_path(int index, const QString &source_path)
{
	const QString suffix = media_suffix(source_path);
	const QString base = QString("media/%1").arg(index, 6, 10, QChar('0'));
	return suffix.isEmpty() ? base : base + "." + suffix;
}

// Version 1 media had no extension; OBS picks decoders by extension, so restore it from the original name.
static QString restored_media_name(const QString &archive_path, const QString &original_path)
{
	const QString base = archive_path.section('/', -1);
	if (!media_suffix(base).isEmpty())
		return base;
	const QString suffix = media_suffix(original_path);
	return suffix.isEmpty() ? base : base + "." + suffix;
}

static bool absolute_any_os(const QString &path)
{
	return path.startsWith('/') ||
	       (path.size() > 2 && path.at(0).isLetter() && path.at(1) == ':' && path.at(2) == '/');
}

static QString normalized_media_path(const QString &value, const QString &base_dir)
{
	QString path = portable_path(value.trimmed());
	if (path.isEmpty() || path.size() > 4096 || path.contains("://"))
		return {};
	if (!absolute_any_os(path)) {
		if (base_dir.isEmpty())
			return {};
		path = base_dir + "/" + path;
	}
	return QDir::cleanPath(path);
}

static QString backup_os_hint(const restore_manifest &manifest)
{
	if (!manifest.os.isEmpty())
		return manifest.os;
	for (const restore_file &file : manifest.files) {
		const QString path = portable_path(file.original_path);
		if (path.size() > 2 && path.at(0).isLetter() && path.at(1) == ':')
			return "windows";
		if (path.startsWith('/'))
			return current_os_name() == "windows" ? "macos or linux" : QString();
	}
	return {};
}

struct media_path_map {
	QHash<QString, QString> exact;
	QHash<QString, QString> folded;

	void insert(const QString &original, const QString &restored)
	{
		const QString key = normalized_media_path(original, {});
		if (key.isEmpty())
			return;
		exact.insert(key, restored);
		folded.insert(key.toLower(), restored);
	}

	QString find(const QString &value, const QString &base_dir) const
	{
		const QString key = normalized_media_path(value, base_dir);
		if (key.isEmpty())
			return {};
		return exact.value(key, folded.value(key.toLower()));
	}
};

// Scene JSON still names the media files at their original absolute paths; point them at the restored copies.
static QJsonValue rewrite_media_paths(const QJsonValue &value, const media_path_map &paths, const QString &base_dir,
				      int *rewritten)
{
	if (value.isArray()) {
		QJsonArray array;
		for (const QJsonValue item : value.toArray())
			array.append(rewrite_media_paths(item, paths, base_dir, rewritten));
		return array;
	}
	if (value.isObject()) {
		QJsonObject object = value.toObject();
		for (auto entry = object.begin(); entry != object.end(); ++entry)
			entry.value() = rewrite_media_paths(entry.value(), paths, base_dir, rewritten);
		return object;
	}
	if (!value.isString())
		return value;
	const QString restored = paths.find(value.toString(), base_dir);
	if (restored.isEmpty())
		return value;
	(*rewritten)++;
	return restored;
}

static QString restored_name(const QString &base, const QDate &date, const QStringList &existing)
{
	const QString stem = QString("%1 (restored %2)")
				     .arg(base.trimmed().isEmpty() ? QString("VISP backup") : base.trimmed(),
					  date.toString(Qt::ISODate));
	for (int suffix = 1;; suffix++) {
		const QString candidate = suffix == 1 ? stem : QString("%1 %2").arg(stem).arg(suffix);
		if (!existing.contains(candidate, Qt::CaseInsensitive))
			return candidate;
	}
}

static QString ini_value(const QByteArray &ini, const QString &section, const QString &key)
{
	QString current;
	for (QString line : QString::fromUtf8(ini).split('\n')) {
		line = line.trimmed();
		if (line.startsWith(QChar(0xfeff)))
			line = line.sliced(1);
		if (line.startsWith('[') && line.endsWith(']')) {
			current = line.sliced(1, line.size() - 2);
			continue;
		}
		const qsizetype separator = line.indexOf('=');
		if (current == section && separator > 0 && line.first(separator).trimmed() == key)
			return line.sliced(separator + 1).trimmed();
	}
	return {};
}

// Line-based so the rest of OBS's basic.ini is written back byte for byte.
static QByteArray set_ini_value(const QByteArray &ini, const QString &section, const QString &key, const QString &value)
{
	const QByteArray bom("\xef\xbb\xbf");
	if (ini.startsWith(bom))
		return bom + set_ini_value(ini.sliced(bom.size()), section, key, value);
	QStringList lines = QString::fromUtf8(ini).split('\n');
	QString current;
	qsizetype section_end = -1;
	for (qsizetype index = 0; index < lines.size(); index++) {
		QString line = lines.at(index).trimmed();
		if (line.startsWith(QChar(0xfeff)))
			line = line.sliced(1);
		if (line.startsWith('[') && line.endsWith(']')) {
			if (current == section)
				break;
			current = line.sliced(1, line.size() - 2);
			section_end = current == section ? index + 1 : section_end;
			continue;
		}
		if (current != section)
			continue;
		const qsizetype separator = line.indexOf('=');
		if (!line.isEmpty())
			section_end = index + 1;
		if (separator > 0 && line.first(separator).trimmed() == key) {
			const bool carriage_return = lines.at(index).endsWith('\r');
			lines[index] = key + "=" + value + (carriage_return ? "\r" : "");
			return lines.join('\n').toUtf8();
		}
	}
	if (section_end < 0) {
		lines.prepend(key + "=" + value);
		lines.prepend("[" + section + "]");
	} else {
		lines.insert(section_end, key + "=" + value);
	}
	return lines.join('\n').toUtf8();
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
	CHECK(classify_ticket_outcome(401, false, false) == ticket_request_outcome::sign_in_required);
	CHECK(classify_ticket_outcome(503, false, false) == ticket_request_outcome::retryable);
	CHECK(classify_ticket_outcome(200, true, false) == ticket_request_outcome::retryable);
	CHECK(classify_ticket_outcome(200, true, true) == ticket_request_outcome::accepted);
	const account_presentation rejected =
		present_account("Connected as streamer", true, control_connection_state::sign_in_required);
	CHECK(rejected.identity == "Connected as streamer" && rejected.can_sign_in && rejected.can_retry &&
	      rejected.can_disconnect && rejected.connection_message.contains("Sign in again"));
	const account_presentation connected =
		present_account("Connected as streamer", true, control_connection_state::connected);
	CHECK(!connected.can_retry && connected.connection_message == "Live control connected.");
	const QList<publishing_device> output_devices{{17, "Studio", false}};
	const output_presentation absent = present_output(0, output_devices, true, false);
	CHECK(absent.state == output_setup_state::not_configured && absent.can_configure);
	const output_presentation matched = present_output(17, output_devices, true, false);
	CHECK(matched.state == output_setup_state::configured && matched.label.contains("Studio"));
	const output_presentation missing = present_output(23, output_devices, true, false);
	CHECK(missing.state == output_setup_state::configured_device_missing);
	CHECK(!present_output(0, output_devices, false, false).can_configure);
	CHECK(!present_output(0, output_devices, true, true).can_configure);
	struct control_response response = {};
	CHECK(parse_control_response("{\"commandVersion\":7,\"desiredStreaming\":true,\"desiredScene\":\"Main \\\"台\\\"\",\"pollAfterMs\":2000}",
				     &response));
	CHECK(response.command_version == 7 && response.desired_streaming &&
	      response.desired_scene == QString::fromUtf8("Main \"台\""));
	// Toggle intents default to false when the server omits them.
	CHECK(!response.desired_recording && !response.desired_virtual_cam && !response.desired_replay_buffer &&
	      !response.desired_record_paused);
	CHECK(parse_control_response(
		"{\"commandVersion\":10,\"desiredStreaming\":false,\"desiredScene\":null,\"desiredRecording\":true,"
		"\"desiredVirtualCam\":true,\"desiredReplayBuffer\":true,\"desiredRecordPaused\":true}",
		&response));
	CHECK(response.command_version == 10 && response.desired_recording && response.desired_virtual_cam &&
	      response.desired_replay_buffer && response.desired_record_paused);
	CHECK(parse_control_response("{\"desiredStreaming\":false,\"desiredScene\":null,\"commandVersion\":8}",
				     &response));
	CHECK(response.command_version == 8 && !response.desired_streaming && response.desired_scene.isNull());
	CHECK(!parse_control_response("{\"commandVersion\":9}", &response));
	struct ticket_response ticket = {};
	CHECK(parse_ticket_response("{\"ticket\":\"one use + secret\",\"expiresAt\":\"2026-07-26T12:00:00Z\"}",
				    &ticket));
	const QUrl live = live_websocket_url("https://visp.example/api/obs/control?old=1", ticket.ticket);
	CHECK(live.scheme() == "wss" && live.path() == "/api/obs/live" &&
	      QUrlQuery(live).queryItemValue("ticket") == ticket.ticket);
	CHECK(live_websocket_url("http://localhost:3000/api/obs/control", "local").scheme() == "ws");
	CHECK(!live_websocket_url("http://visp.example/api/obs/control", "ticket").isValid());
	CHECK(!live_websocket_url("ftp://visp.example/control", "ticket").isValid());
	const QByteArray key = "dGhlIHNhbXBsZSBub25jZQ==";
	CHECK(websocket_accept(key) == "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
	CHECK(valid_websocket_handshake(
		"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: keep-alive, Upgrade\r\nSec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n\r\n",
		key));
	CHECK(!valid_websocket_handshake(
		"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: wrong\r\n\r\n",
		key));
	const QByteArray client_frame = make_websocket_frame(1, "hello", 0x01020304);
	CHECK(client_frame.toHex() == "81850102030469676f686e");
	websocket_frame frame = parse_websocket_frame(QByteArray("\x81\x05hello", 7));
	CHECK(frame.result == websocket_parse_result::text && frame.payload == "hello" && frame.consumed == 7);
	CHECK(parse_websocket_frame(QByteArray("\x81\x05hel", 5)).result == websocket_parse_result::incomplete);
	CHECK(parse_websocket_frame(QByteArray("\x89\x01x", 3)).result == websocket_parse_result::ping);
	CHECK(parse_websocket_frame(QByteArray("\x82\x00", 2)).result == websocket_parse_result::error);
	CHECK(parse_websocket_frame(QByteArray("\x81\x80", 2)).result == websocket_parse_result::error);
	CHECK(parse_websocket_frame(QByteArray("\x01\x00", 2)).result == websocket_parse_result::error);
	QByteArray extended("\x81\x7e\x00\x7e", 4);
	extended.append(QByteArray(126, 'x'));
	frame = parse_websocket_frame(extended + QByteArray("\x8a\x00", 2));
	CHECK(frame.result == websocket_parse_result::text && frame.payload.size() == 126 && frame.consumed == 130);
	CHECK(parse_websocket_frame(QByteArray("\x81\x7e\x00\x7d", 4)).result == websocket_parse_result::error);
	CHECK(parse_websocket_frame(QByteArray("\x81\x7e\xff\xff", 4), 1024).result == websocket_parse_result::error);
	const QJsonObject first_poll = QJsonDocument::fromJson(
		make_control_request(false, false, false, false, false, 8, {"Old scene", "Removed scene"}, QString()))
					       .object();
	CHECK(first_poll.value("currentScene").isNull());
	CHECK(first_poll.value("scenes").toArray().size() == 2);
	CHECK(first_poll.value("recording").toBool() == false && first_poll.value("virtualCam").toBool() == false);
	const QJsonObject renamed_poll = QJsonDocument::fromJson(
		make_control_request(true, true, true, true, true, 9, {QString::fromUtf8("Main \"台\""), "Renamed scene"},
				     "Renamed scene"))
					         .object();
	CHECK(renamed_poll.value("currentScene").toString() == "Renamed scene");
	CHECK(renamed_poll.value("scenes").toArray().at(0).toString() == QString::fromUtf8("Main \"台\""));
	CHECK(!renamed_poll.value("scenes").toArray().contains("Removed scene"));
	CHECK(renamed_poll.value("recording").toBool() && renamed_poll.value("virtualCam").toBool() &&
	      renamed_poll.value("replayBuffer").toBool() && renamed_poll.value("recordPaused").toBool());
	struct devices_response devices = {};
	CHECK(parse_devices_response(
		"{\"account\":{\"handle\":\"streamer\"},\"devices\":[{\"id\":1,\"label\":\"Phone\",\"publishing\":true}]}",
		&devices));
	CHECK(devices.handle == "streamer" && devices.devices.size() == 1 && devices.devices.at(0).id == 1 &&
	      devices.devices.at(0).publishing);
	CHECK(!parse_devices_response("{\"account\":{},\"devices\":[]}", &devices));
	struct device_code_response code = {};
	CHECK(parse_device_code_response(
		"{\"device_code\":\"secret\",\"user_code\":\"ABCD1234\",\"verification_uri\":\"https://visp.example/device\",\"verification_uri_complete\":\"https://visp.example/device?user_code=ABCD1234\",\"expires_in\":1800,\"interval\":5}",
		&code));
	CHECK(code.interval == 5 && code.user_code == "ABCD1234");
	CHECK(code.verification_url == QUrl("https://visp.example/device") && !code.verification_url.hasQuery());
	CHECK(format_user_code(code.user_code) == "ABCD-1234" && format_user_code("ABC") == "ABC");
	CHECK(!parse_device_code_response(
		"{\"device_code\":\"secret\",\"user_code\":\"ABCD\",\"verification_uri_complete\":\"https://visp.example/device?user_code=ABCD\",\"expires_in\":1,\"interval\":1}",
		&code));
	CHECK(!parse_device_code_response(
		"{\"device_code\":\"secret\",\"user_code\":\"ABCD\",\"verification_uri\":\"http://visp.example/device\",\"expires_in\":1,\"interval\":1}",
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
	const QByteArray hash(64, 'a');
	restore_manifest manifest;
	CHECK(parse_backup_manifest(QJsonDocument::fromJson(
					    "{\"version\":1,\"createdAt\":\"x\",\"files\":[{\"path\":\"media/000001\","
					    "\"originalPath\":\"C:/media/logo.PNG\",\"byteSize\":5}]}")
					    .object(),
				    &manifest));
	CHECK(manifest.version == 1 && manifest.files.at(0).sha256.isEmpty() && backup_os_hint(manifest) == "windows");
	CHECK(parse_backup_manifest(
		QJsonDocument::fromJson("{\"version\":2,\"os\":\"linux\",\"sceneCollection\":\"Main\",\"files\":["
					"{\"path\":\"scenes/Main.json\",\"originalPath\":\"/obs/scenes/Main.json\","
					"\"byteSize\":3,\"sha256\":\"" +
					hash + "\"}]}")
			.object(),
		&manifest));
	CHECK(manifest.version == 2 && manifest.scene_collection == "Main" && manifest.files.at(0).sha256 == hash);
	CHECK(!parse_backup_manifest(QJsonDocument::fromJson("{\"version\":2,\"files\":[{\"path\":\"scenes/a.json\","
							     "\"originalPath\":\"a\",\"byteSize\":3}]}")
					     .object(),
				     &manifest));
	for (const char *path : {"../escape", "media//x", "media\\x", "manifest.json", "/abs"}) {
		const QJsonObject bad{
			{"version", 1},
			{"files", QJsonArray{QJsonObject{{"path", path}, {"originalPath", "x"}, {"byteSize", 1}}}}};
		CHECK(!parse_backup_manifest(bad, &manifest));
	}
	CHECK(!parse_backup_manifest(QJsonObject{{"version", 3}, {"files", QJsonArray{}}}, &manifest));
	QList<backup_summary> backups;
	CHECK(parse_backup_list(
		"{\"backups\":[{\"id\":\"6f1c1f3e-8f4c-4c1e-9a55-0a4b2b8f2a11\",\"completedAt\":"
		"\"2026-10-10T10:00:00.000Z\",\"fileCount\":2,\"totalBytes\":4294967296,\"label\":\"Main\"}]}",
		&backups));
	CHECK(backups.size() == 1 && backups.at(0).total_bytes == 4294967296LL && backups.at(0).label == "Main");
	CHECK(!parse_backup_list("{\"backups\":[{\"id\":\"../x\",\"completedAt\":\"2026-10-10T10:00:00Z\"}]}",
				 &backups));
	CHECK(backup_media_path(1, "C:/media/Logo.PNG") == "media/000001.png");
	CHECK(backup_media_path(2, "/media/no-extension") == "media/000002");
	CHECK(restored_media_name("media/000001", "C:\\media\\clip.MP4") == "000001.mp4");
	CHECK(restored_media_name("media/000002.png", "/x/y.jpg") == "000002.png");
	CHECK(restored_media_name("media/000003", "/x/evil.p/ng") == "000003");
	media_path_map paths;
	paths.insert("C:/Users/me/Media/logo.png", "/restored/000001.png");
	paths.insert("/home/me/obs/basic/scenes/intro.mp4", "/restored/000002.mp4");
	int rewritten = 0;
	const QJsonObject scene_json =
		rewrite_media_paths(
			QJsonObject{{"name", "Main"},
				    {"sources",
				     QJsonArray{QJsonObject{{"settings",
							     QJsonObject{{"file", "C:\\Users\\me\\media\\LOGO.png"}}}},
						QJsonObject{{"settings", QJsonObject{{"local_file", "intro.mp4"}}}},
						QJsonObject{{"settings",
							     QJsonObject{{"url", "https://example.com/a.png"}}}}}}},
			paths, "/home/me/obs/basic/scenes", &rewritten)
			.toObject();
	const QJsonArray rewritten_sources = scene_json.value("sources").toArray();
	CHECK(rewritten == 2 && scene_json.value("name").toString() == "Main");
	CHECK(rewritten_sources.at(0).toObject().value("settings").toObject().value("file").toString() ==
	      "/restored/000001.png");
	CHECK(rewritten_sources.at(1).toObject().value("settings").toObject().value("local_file").toString() ==
	      "/restored/000002.mp4");
	CHECK(rewritten_sources.at(2).toObject().value("settings").toObject().value("url").toString() ==
	      "https://example.com/a.png");
	const QDate day(2026, 10, 10);
	CHECK(restored_name("Main", day, {}) == "Main (restored 2026-10-10)");
	CHECK(restored_name("Main", day, {"main (restored 2026-10-10)"}) == "Main (restored 2026-10-10) 2");
	const QByteArray ini("\xef\xbb\xbf[General]\r\nName=Streaming\r\n\r\n[Video]\r\nBaseCX=1920\r\n");
	CHECK(ini_value(ini, "General", "Name") == "Streaming" && ini_value(ini, "Video", "BaseCX") == "1920");
	const QByteArray renamed = set_ini_value(ini, "General", "Name", "Streaming (restored 2026-10-10)");
	CHECK(ini_value(renamed, "General", "Name") == "Streaming (restored 2026-10-10)");
	CHECK(renamed.startsWith("\xef\xbb\xbf[General]\r\n") && renamed.contains("BaseCX=1920\r\n"));
	CHECK(ini_value(set_ini_value("[Video]\nBaseCX=1\n", "General", "Name", "New"), "General", "Name") == "New");
	return 0;
}

#else

#include <QNetworkAccessManager>
#include <QCoreApplication>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QRandomGenerator>
#include <QSslSocket>
#include <QDir>
#include <QDirIterator>
#include <QDesktopServices>
#include <QDialog>
#include <QDialogButtonBox>
#include <QFileDialog>
#include <QFile>
#include <QFileInfo>
#include <QFontDatabase>
#include <QFormLayout>
#include <QGroupBox>
#include <QHBoxLayout>
#include <QInputDialog>
#include <QLabel>
#include <QLineEdit>
#include <QLocale>
#include <QMessageBox>
#include <QObject>
#include <QPushButton>
#include <QSaveFile>
#include <QScrollArea>
#include <QSettings>
#include <QTemporaryDir>
#include <QTimer>
#include <QVBoxLayout>
#include <QWidget>
#include <functional>
#include <memory>
#include <obs-frontend-api.h>
#include <obs-hotkey.h>
#include <obs-module.h>
#include <plugin-support.h>
#include <util/config-file.h>
#include <util/platform.h>

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

struct backup_file {
	QString source_path;
	QString archive_path;
	QByteArray sha256;
};

static control_connection_state current_control_state = control_connection_state::inactive;

static bool secure_url(const QString &value)
{
	const QUrl url(value);
	const bool local_http = url.scheme() == "http" &&
				(url.host() == "localhost" || url.host() == "127.0.0.1" || url.host() == "::1");
	return url.isValid() && !url.host().isEmpty() && (url.scheme() == "https" || local_http);
}

static void collect_referenced_files(const QJsonValue &value, const QDir &base,
					     QSet<QString> *files)
{
	if (value.isArray()) {
		for (const QJsonValue item : value.toArray())
			collect_referenced_files(item, base, files);
		return;
	}
	if (value.isObject()) {
		for (const QJsonValue item : value.toObject())
			collect_referenced_files(item, base, files);
		return;
	}
	if (!value.isString())
		return;
	QFileInfo file(value.toString());
	if (file.isRelative())
		file.setFile(base.absoluteFilePath(file.filePath()));
	if (file.isFile())
		files->insert(file.canonicalFilePath());
}

// The OBS user config folder: three levels above the current profile (basic/profiles/<name>).
static bool obs_config_root(QDir *root, QString *error)
{
	char *profile_path = obs_frontend_get_current_profile_path();
	if (!profile_path) {
		*error = "OBS could not find the current profile.";
		return false;
	}
	QDir config_root(QString::fromUtf8(profile_path));
	bfree(profile_path);
	if (!config_root.cdUp() || !config_root.cdUp() || !config_root.cdUp()) {
		*error = "OBS returned an unexpected profile path.";
		return false;
	}
	*root = config_root;
	return true;
}

static QString take_frontend_string(char *value)
{
	const QString result = value ? QString::fromUtf8(value) : QString();
	bfree(value);
	return result;
}

static QStringList take_frontend_list(char **values)
{
	QStringList result;
	for (char **value = values; value && *value; value++)
		result.append(QString::fromUtf8(*value));
	bfree(values);
	return result;
}

static bool obs_outputs_active()
{
	return obs_frontend_streaming_active() || obs_frontend_recording_active() ||
	       obs_frontend_replay_buffer_active() || obs_frontend_virtualcam_active();
}

static bool read_file(const QString &path, QByteArray *contents)
{
	QFile file(path);
	if (!file.open(QIODevice::ReadOnly))
		return false;
	*contents = file.readAll();
	return true;
}

static bool write_file(const QString &path, const QByteArray &contents)
{
	QSaveFile file(path);
	return file.open(QIODevice::WriteOnly) && file.write(contents) == contents.size() && file.commit();
}

// OBS does not create the per-plugin config folder; saving fails until it exists (fresh Windows installs).
static char *config_file_path()
{
	char *dir = obs_module_config_path("");
	if (dir) {
		os_mkdirs(dir);
		bfree(dir);
	}
	return obs_module_config_path("config.ini");
}

static plugin_config load_config()
{
	plugin_config result;
	char *path = config_file_path();
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
	char *path = config_file_path();
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
		obs_data_release(settings);
		obs_source_release(source);
		return true;
	}

	const QString source_name = unique_source_name(value.name);
	source = obs_source_create("ffmpeg_source", source_name.toUtf8().constData(), settings, nullptr);
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

struct path_id_collector {
	QSet<qint64> ids;
};

static bool collect_visp_path_ids(void *private_data, obs_source_t *source)
{
	auto *collector = static_cast<path_id_collector *>(private_data);
	if (QString::fromUtf8(obs_source_get_unversioned_id(source)) != "ffmpeg_source")
		return true;
	obs_data_t *settings = obs_source_get_settings(source);
	const QString path_id = QString::fromUtf8(obs_data_get_string(settings, "visp_path_id"));
	obs_data_release(settings);
	bool ok = false;
	const qint64 id = path_id.toLongLong(&ok);
	if (ok && id > 0)
		collector->ids.insert(id);
	return true;
}

static bool update_media_source(const media_source_response &value, QString *error)
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
	if (!source) {
		obs_data_release(settings);
		return true;
	}
	obs_source_update(source, settings);
	obs_data_release(settings);
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
		: QDialog(parent), output_path_id(settings.output_path_id), network(this), auth_timer(this),
		  health_timer(this)
	{
		setWindowTitle("VISP for OBS");
		setMinimumWidth(640);
		url.setText(settings.control_url.isEmpty() ? DEFAULT_CONTROL_URL : settings.control_url);
		token.setText(settings.token);
		token.setEchoMode(QLineEdit::PasswordEchoOnEdit);
		token.setPlaceholderText("Legacy pairing token");
		account_status.setWordWrap(true);
		connection_status.setWordWrap(true);
		// A widget stylesheet, so OBS themes that style every QLabel cannot shrink it.
		pairing_code.setStyleSheet(
			QString("QLabel { font-family: \"%1\"; font-size: 20pt; font-weight: bold; }")
				.arg(QFontDatabase::systemFont(QFontDatabase::FixedFont).family()));
		pairing_code.setTextInteractionFlags(Qt::TextSelectableByMouse);
		pairing_code.hide();
		account_identity = settings.token.isEmpty() ? QString() : QString("Checking VISP account...");

		sign_in_button = new QPushButton("Sign in with browser");
		retry_button = new QPushButton("Retry connection");
		auto *refresh = new QPushButton("Refresh devices");
		disconnect_button = new QPushButton("Disconnect");
		connect(sign_in_button, &QPushButton::clicked, this, [this]() { begin_sign_in(); });
		connect(retry_button, &QPushButton::clicked, this, [this]() { retry_connection(); });
		connect(refresh, &QPushButton::clicked, this, [this]() { load_devices(); });
		connect(disconnect_button, &QPushButton::clicked, this, [this]() { disconnect_account(); });
		auto *account_actions = new QHBoxLayout;
		account_actions->addWidget(sign_in_button);
		account_actions->addWidget(retry_button);
		account_actions->addWidget(refresh);
		account_actions->addWidget(disconnect_button);
		account_actions->addStretch();
		auto *account_layout = new QVBoxLayout;
		account_layout->addWidget(&account_status);
		account_layout->addWidget(&pairing_code);
		account_layout->addWidget(&connection_status);
		account_layout->addLayout(account_actions);
		auto *account_group = new QGroupBox("Account");
		account_group->setLayout(account_layout);

		output_status.setWordWrap(true);
		output_guidance.setWordWrap(true);
		device_label.setText("OBS");
		configure_output_button = new QPushButton("Use this OBS as an output");
		connect(configure_output_button, &QPushButton::clicked, this, [this]() { create_output_device(); });
		auto *output_action = new QHBoxLayout;
		output_action->addWidget(&device_label, 1);
		output_action->addWidget(configure_output_button);
		auto *output_layout = new QVBoxLayout;
		output_layout->addWidget(&output_status);
		output_layout->addWidget(&output_guidance);
		output_layout->addLayout(output_action);
		auto *output_group = new QGroupBox("This OBS profile output");
		output_group->setLayout(output_layout);

		backup_status.setWordWrap(true);
		backup_button = new QPushButton("Back up to VISP");
		connect(backup_button, &QPushButton::clicked, this, [this]() { start_backup(); });
		restore_button = new QPushButton("Restore from VISP");
		connect(restore_button, &QPushButton::clicked, this, [this]() { start_restore(); });
		auto *backup_actions = new QHBoxLayout;
		backup_actions->addWidget(backup_button);
		backup_actions->addWidget(restore_button);
		backup_actions->addStretch();
		auto *backup_layout = new QVBoxLayout;
		backup_layout->addWidget(&backup_status);
		backup_layout->addLayout(backup_actions);
		auto *backup_group = new QGroupBox("VISP OBS backup");
		backup_group->setLayout(backup_layout);

		devices_layout = new QVBoxLayout(&devices_widget);
		devices_layout->setContentsMargins(0, 0, 0, 0);
		auto *scroll = new QScrollArea;
		scroll->setWidget(&devices_widget);
		scroll->setWidgetResizable(true);
		scroll->setMinimumHeight(150);

		auto *form = new QFormLayout;
		form->addRow("Control URL", &url);
		form->addRow("Pairing token", &token);
		auto *import_button = new QPushButton("Import config.ini");
		connect(import_button, &QPushButton::clicked, this, [this]() { import_config(); });
		auto *advanced_layout = new QVBoxLayout;
		advanced_layout->addLayout(form);
		advanced_layout->addWidget(import_button, 0, Qt::AlignLeft);
		auto *advanced_widget = new QWidget;
		advanced_widget->setLayout(advanced_layout);
		advanced_widget->setVisible(false);
		auto *advanced_toggle = new QPushButton("Advanced");
		advanced_toggle->setCheckable(true);
		connect(advanced_toggle, &QPushButton::toggled, advanced_widget, &QWidget::setVisible);

		auto *buttons = new QDialogButtonBox(QDialogButtonBox::Save | QDialogButtonBox::Cancel);
		connect(buttons, &QDialogButtonBox::accepted, this, [this]() { validate_and_accept(); });
		connect(buttons, &QDialogButtonBox::rejected, this, &QDialog::reject);
		connect(&auth_timer, &QTimer::timeout, this, [this]() { poll_device_token(); });
		connect(&health_timer, &QTimer::timeout, this, [this]() {
			refresh_account_presentation();
			refresh_output_presentation();
			refresh_backup_presentation();
		});
		health_timer.start(250);

		auto *layout = new QVBoxLayout(this);
		auto *intro = new QLabel(
			"Sign in to manage publishing devices, add relay feeds, and keep VISP remote control connected.");
		intro->setWordWrap(true);
		layout->addWidget(intro);
		layout->addWidget(account_group);
		layout->addWidget(output_group);
		layout->addWidget(backup_group);
		layout->addWidget(new QLabel("Publishing devices"));
		layout->addWidget(scroll);
		layout->addSpacing(8);
		layout->addWidget(advanced_toggle);
		layout->addWidget(advanced_widget);
		layout->addWidget(buttons);
		refresh_account_presentation();
		refresh_output_presentation();
		refresh_backup_presentation();

		if (!settings.token.isEmpty())
			QTimer::singleShot(0, this, [this]() { load_devices(); });
	}

	plugin_config settings() const
	{
		return {url.text().trimmed(), token.text().trimmed(), output_path_id};
	}

private:
	using ReplyHandler = std::function<void(int, const QByteArray &)>;

	/* The code the user types on the approval page; hidden when none is pending. */
	void show_pairing_code(const QString &code)
	{
		pairing_code.setText(code);
		pairing_code.setVisible(!code.isEmpty());
	}

	void set_account_status(const QString &message)
	{
		account_identity = message;
		refresh_account_presentation();
	}

	void refresh_account_presentation()
	{
		const account_presentation presentation =
			present_account(account_identity, !token.text().trimmed().isEmpty(), current_control_state);
		account_status.setText(presentation.identity);
		connection_status.setText(presentation.connection_message);
		sign_in_button->setText(current_control_state == control_connection_state::sign_in_required
					? "Sign in again"
					: "Sign in with browser");
		sign_in_button->setEnabled(presentation.can_sign_in);
		retry_button->setEnabled(presentation.can_retry);
		disconnect_button->setEnabled(presentation.can_disconnect);
	}

	void refresh_output_presentation()
	{
		const bool has_credential = !token.text().trimmed().isEmpty();
		const bool streaming = obs_frontend_streaming_active();
		const output_presentation presentation =
			present_output(output_path_id, loaded_devices, has_credential, streaming);
		if (!devices_loaded && output_path_id > 0) {
			output_status.setText("Checking the saved VISP output device...");
		} else {
			output_status.setText(presentation.label);
		}
		configure_output_button->setEnabled(presentation.can_configure);
		output_guidance.setText(!has_credential
					? "Sign in before configuring this profile's output."
					: streaming
						  ? "Stop streaming before replacing this profile's destination."
						  : "This replaces the current profile's streaming destination.");
	}

	void set_backup_actions_enabled(bool enabled)
	{
		backup_button->setEnabled(enabled);
		restore_button->setEnabled(enabled);
	}

	void refresh_backup_presentation()
	{
		if (backup_in_progress || restore_in_progress)
			return;
		const bool connected = !token.text().trimmed().isEmpty() && secure_url(url.text().trimmed());
		set_backup_actions_enabled(connected);
		if (backup_status.text().isEmpty() || backup_status.text() == "Sign in to back up this OBS setup.")
			backup_status.setText(
				connected
					? "Back up scene collections, profile settings, and linked local media, or restore an earlier backup as a new scene collection and profile. Stream keys and VISP credentials stay on this computer."
					: "Sign in to back up this OBS setup.");
	}

	void retry_connection()
	{
		const plugin_config saved = load_config();
		apply_config(saved);
		set_account_status(saved.token.isEmpty() ? QString() : QString("Checking VISP account..."));
		if (!saved.token.isEmpty())
			load_devices();
	}

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
			QByteArray response = reply->readAll();
			// Network/TLS failures have no body; surface Qt's reason instead of a generic fallback.
			if (response.isEmpty() && reply->error() != QNetworkReply::NoError)
				response = reply->errorString().toUtf8();
			handler(status, response);
			reply->deleteLater();
		});
	}

	bool collect_backup_files(QString *error)
	{
		backup_files.clear();
		obs_frontend_save();
		QDir config_root;
		if (!obs_config_root(&config_root, error))
			return false;
		const QString root_path = QFileInfo(config_root.absolutePath()).canonicalFilePath();
		QDir scenes(config_root.filePath("basic/scenes"));
		QDir profiles(config_root.filePath("basic/profiles"));
		if (root_path.isEmpty() || !scenes.exists() || !profiles.exists()) {
			*error = "OBS scene or profile data is unavailable.";
			return false;
		}
		auto inside_config_root = [&root_path](const QFileInfo &file) {
			const QString path = file.canonicalFilePath();
			return path.startsWith(root_path + QDir::separator());
		};
		QSet<QString> media_files;
		for (const QFileInfo &scene : scenes.entryInfoList({"*.json"}, QDir::Files)) {
			// The server refuses empty uploads, and an empty file has nothing to restore.
			if (!inside_config_root(scene) || scene.size() == 0)
				continue;
			backup_files.append({scene.canonicalFilePath(), "scenes/" + scene.fileName(), {}});
			QFile scene_file(scene.filePath());
			if (scene_file.open(QIODevice::ReadOnly)) {
				const QJsonDocument scene_document = QJsonDocument::fromJson(scene_file.readAll());
				if (scene_document.isArray())
					collect_referenced_files(scene_document.array(), scenes, &media_files);
				else if (scene_document.isObject())
					collect_referenced_files(scene_document.object(), scenes, &media_files);
			}
		}
		QDirIterator profiles_iterator(profiles.absolutePath(), {"basic.ini"}, QDir::Files,
						       QDirIterator::Subdirectories);
		while (profiles_iterator.hasNext()) {
			profiles_iterator.next();
			const QFileInfo profile(profiles_iterator.fileInfo());
			if (inside_config_root(profile) && profile.size() > 0)
				backup_files.append({profile.canonicalFilePath(),
						     "profiles/" + profiles.relativeFilePath(profile.filePath()),
						     {}});
		}
		int media_index = 0;
		for (const QString &path : media_files) {
			const QFileInfo media(path);
			if (media.size() == 0)
				continue;
			if (media.size() > 4LL * 1024 * 1024 * 1024) {
				*error = QString("%1 is larger than the 4 GB per-file backup limit.").arg(media.fileName());
				backup_files.clear();
				return false;
			}
			backup_files.append({path, backup_media_path(++media_index, path), {}});
		}
		if (backup_files.isEmpty()) {
			*error = "No OBS scene or profile files were found.";
			return false;
		}
		return true;
	}

	void start_backup()
	{
		const plugin_config value = settings();
		if (value.token.isEmpty() || !secure_url(value.control_url)) {
			QMessageBox::warning(this, "VISP OBS backup", "Sign in before backing up OBS.");
			return;
		}
		QString error;
		if (!collect_backup_files(&error)) {
			QMessageBox::warning(this, "VISP OBS backup", error);
			return;
		}
		qint64 bytes = 0;
		for (const backup_file &file : backup_files)
			bytes += QFileInfo(file.source_path).size();
		if (QMessageBox::question(
				this, "Back up to VISP",
				QString("Upload %1 files (%2) to VISP? This includes scene collections, profile settings, and linked local media. Stream keys and VISP credentials are excluded.")
					.arg(backup_files.size())
					.arg(QLocale().formattedDataSize(bytes))) != QMessageBox::Yes)
			return;
		backup_in_progress = true;
		set_backup_actions_enabled(false);
		backup_status.setText("Creating VISP backup...");
		QJsonObject details{{"os", current_os_name()},
				    {"obsVersion", QString::fromUtf8(obs_get_version_string()).left(256)}};
		const QString collection = take_frontend_string(obs_frontend_get_current_scene_collection()).trimmed();
		if (!collection.isEmpty())
			details.insert("label", collection.left(256));
		send(endpoint_url(value.control_url, "/api/obs/backups"), true, details, value.token,
		     [this](int status, const QByteArray &body) {
			     const QJsonDocument document = QJsonDocument::fromJson(body);
			     const QString id = document.object().value("id").toString();
			     if (status < 200 || status >= 300 || id.isEmpty()) {
				     finish_backup(response_error(body, "VISP could not create the backup."));
				     return;
			     }
			     backup_id = id;
			     backup_index = 0;
			     upload_next_backup_file();
		     });
	}

	void request_backup_upload_url(const QString &archive_path, qint64 bytes,
				       std::function<void(const QUrl &)> handler)
	{
		const plugin_config value = settings();
		send(endpoint_url(value.control_url, QString("/api/obs/backups/%1/files").arg(backup_id)), true,
		     {{"path", archive_path}, {"byteSize", bytes}}, value.token,
		     [this, handler = std::move(handler)](int status, const QByteArray &body) {
			     const QUrl upload_url(QJsonDocument::fromJson(body).object().value("uploadUrl").toString());
			     if (status < 200 || status >= 300 || !secure_url(upload_url.toString())) {
				     finish_backup(response_error(body, "VISP could not prepare a backup upload."));
				     return;
			     }
			     handler(upload_url);
		     });
	}

	void upload_next_backup_file()
	{
		if (backup_index >= backup_files.size()) {
			upload_backup_manifest();
			return;
		}
		const backup_file file = backup_files.at(backup_index);
		const QFileInfo info(file.source_path);
		backup_status.setText(QString("Checking %1 of %2...").arg(backup_index + 1).arg(backup_files.size()));
		hash_file(file.source_path, [this, file, bytes = info.size()](const QByteArray &sha256) {
			if (sha256.isEmpty()) {
				finish_backup(
					QString("Could not read %1.").arg(QFileInfo(file.source_path).fileName()));
				return;
			}
			backup_files[backup_index].sha256 = sha256;
			backup_status.setText(
				QString("Uploading %1 of %2...").arg(backup_index + 1).arg(backup_files.size()));
			upload_backup_file(file, bytes);
		});
	}

	void upload_backup_file(const backup_file &file, qint64 bytes)
	{
		request_backup_upload_url(file.archive_path, bytes, [this, file](const QUrl &upload_url) {
			backup_upload_file.setFileName(file.source_path);
			if (!backup_upload_file.open(QIODevice::ReadOnly)) {
				finish_backup(QString("Could not read %1.").arg(QFileInfo(file.source_path).fileName()));
				return;
			}
			QNetworkRequest request(upload_url);
			request.setHeader(QNetworkRequest::ContentTypeHeader, "application/octet-stream");
			request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
			QNetworkReply *reply = network.put(request, &backup_upload_file);
			connect(reply, &QNetworkReply::finished, this, [this, reply]() {
				const int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
				const bool uploaded = reply->error() == QNetworkReply::NoError && status >= 200 && status < 300;
				const QByteArray body = reply->readAll();
				backup_upload_file.close();
				reply->deleteLater();
				if (!uploaded) {
					finish_backup(response_error(body, "A file upload failed."));
					return;
				}
				backup_index++;
				upload_next_backup_file();
			});
		});
	}

	void upload_backup_manifest()
	{
		QJsonArray files;
		for (const backup_file &file : backup_files) {
			const QFileInfo info(file.source_path);
			files.append(QJsonObject{{"path", file.archive_path},
						 {"originalPath", file.source_path},
						 {"byteSize", info.size()},
						 {"sha256", QString::fromLatin1(file.sha256)}});
		}
		QJsonObject document{{"version", 2},
				     {"createdAt", QDateTime::currentDateTimeUtc().toString(Qt::ISODate)},
				     {"os", current_os_name()},
				     {"obsVersion", QString::fromUtf8(obs_get_version_string()).left(256)},
				     {"files", files}};
		const QString collection = take_frontend_string(obs_frontend_get_current_scene_collection()).trimmed();
		const QString profile = take_frontend_string(obs_frontend_get_current_profile()).trimmed();
		if (!collection.isEmpty())
			document.insert("sceneCollection", collection.left(256));
		if (!profile.isEmpty())
			document.insert("profile", profile.left(256));
		const QByteArray manifest = QJsonDocument(document).toJson(QJsonDocument::Compact);
		backup_status.setText("Saving backup manifest...");
		request_backup_upload_url("manifest.json", manifest.size(), [this, manifest](const QUrl &upload_url) {
			QNetworkRequest request(upload_url);
			request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
			request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
			QNetworkReply *reply = network.put(request, manifest);
			connect(reply, &QNetworkReply::finished, this, [this, reply]() {
				const int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
				const QByteArray body = reply->readAll();
				const bool uploaded = reply->error() == QNetworkReply::NoError && status >= 200 && status < 300;
				reply->deleteLater();
				if (!uploaded) {
					finish_backup(response_error(body, "Could not save the backup manifest."));
					return;
				}
				complete_backup();
			});
		});
	}

	void complete_backup()
	{
		const plugin_config value = settings();
		backup_status.setText("Finishing VISP backup...");
		send(endpoint_url(value.control_url, QString("/api/obs/backups/%1/complete").arg(backup_id)), true, {},
		     value.token, [this](int status, const QByteArray &body) {
			     finish_backup(status >= 200 && status < 300
						   ? QString()
						   : response_error(body, "VISP could not verify the backup."));
		     });
	}

	void finish_backup(const QString &error)
	{
		backup_upload_file.close();
		backup_in_progress = false;
		set_backup_actions_enabled(!token.text().trimmed().isEmpty() && secure_url(url.text().trimmed()));
		if (error.isEmpty()) {
			backup_status.setText("VISP backup complete.");
			QMessageBox::information(this, "VISP OBS backup", "Your OBS scenes, profile settings, and linked media are backed up to VISP.");
			return;
		}
		backup_status.setText("Backup failed: " + error);
		QMessageBox::warning(this, "VISP OBS backup", error);
	}

	struct file_hash_job {
		QFile file;
		QCryptographicHash hash{QCryptographicHash::Sha256};
		std::function<void(const QByteArray &)> done;
	};

	// Hashes in slices on the UI thread so multi-gigabyte media never freezes OBS. Empty result = read error.
	void hash_file(const QString &path, std::function<void(const QByteArray &)> done)
	{
		auto job = std::make_shared<file_hash_job>();
		job->file.setFileName(path);
		job->done = std::move(done);
		if (!job->file.open(QIODevice::ReadOnly)) {
			job->done({});
			return;
		}
		hash_file_step(job);
	}

	void hash_file_step(const std::shared_ptr<file_hash_job> &job)
	{
		const QByteArray chunk = job->file.read(8 * 1024 * 1024);
		if (!chunk.isEmpty()) {
			job->hash.addData(chunk);
			QTimer::singleShot(0, this, [this, job]() { hash_file_step(job); });
			return;
		}
		const bool ok = job->file.error() == QFileDevice::NoError && job->file.atEnd();
		job->file.close();
		job->done(ok ? job->hash.result().toHex() : QByteArray());
	}

	void start_restore()
	{
		const plugin_config value = settings();
		if (value.token.isEmpty() || !secure_url(value.control_url)) {
			QMessageBox::warning(this, "Restore from VISP", "Sign in before restoring a backup.");
			return;
		}
		if (obs_outputs_active()) {
			QMessageBox::warning(
				this, "Restore from VISP",
				"Stop streaming, recording, the replay buffer, and the virtual camera before restoring.");
			return;
		}
		restore_in_progress = true;
		set_backup_actions_enabled(false);
		backup_status.setText("Loading VISP backups...");
		send(endpoint_url(value.control_url, "/api/obs/backups"), false, {}, value.token,
		     [this](int status, const QByteArray &body) {
			     QList<backup_summary> backups;
			     if (status < 200 || status >= 300 || !parse_backup_list(body, &backups)) {
				     finish_restore(response_error(body, "VISP could not list your backups."));
				     return;
			     }
			     if (backups.isEmpty()) {
				     finish_restore({}, "No VISP backups yet. Use Back up to VISP first.");
				     return;
			     }
			     choose_restore_backup(backups);
		     });
	}

	void choose_restore_backup(const QList<backup_summary> &backups)
	{
		QStringList items;
		for (const backup_summary &backup : backups) {
			// One multi-arg call, so a label containing "%2" cannot swallow a later argument.
			items.append(QString("%1. %2 — %3 (%4 files, %5%6)")
					     .arg(QString::number(items.size() + 1),
						  QLocale().toString(backup.completed_at.toLocalTime(),
								     QLocale::ShortFormat),
						  backup.label.isEmpty() ? QString("OBS backup") : backup.label,
						  QString::number(backup.file_count),
						  QLocale().formattedDataSize(backup.total_bytes),
						  backup.os.isEmpty() ? QString() : ", " + backup.os));
		}
		bool chosen = false;
		const QString item = QInputDialog::getItem(this, "Restore from VISP",
							   "Choose a backup to restore:", items, 0, false, &chosen);
		const qsizetype index = items.indexOf(item);
		if (!chosen || index < 0) {
			finish_restore({}, {});
			return;
		}
		restore_id = backups.at(index).id;
		restore_created_at = backups.at(index).completed_at;
		load_restore_manifest();
	}

	void load_restore_manifest()
	{
		const plugin_config value = settings();
		backup_status.setText("Reading backup manifest...");
		send(endpoint_url(value.control_url, QString("/api/obs/backups/%1/manifest").arg(restore_id)), false,
		     {}, value.token, [this](int status, const QByteArray &body) {
			     const QJsonObject manifest =
				     QJsonDocument::fromJson(body).object().value("manifest").toObject();
			     if (status < 200 || status >= 300 || !parse_backup_manifest(manifest, &restore_data)) {
				     finish_restore(response_error(body, "VISP returned an invalid backup manifest."));
				     return;
			     }
			     confirm_restore();
		     });
	}

	void confirm_restore()
	{
		const QString backup_os = backup_os_hint(restore_data);
		if (!backup_os.isEmpty() && backup_os != current_os_name() &&
		    QMessageBox::warning(
			    this, "Restore from VISP",
			    QString("This backup was made on %1, but this computer runs %2. Scenes and media will be restored, but devices, capture sources, fonts, and output paths may need to be set up again. Continue?")
				    .arg(backup_os, current_os_name()),
			    QMessageBox::Yes | QMessageBox::No) != QMessageBox::Yes) {
			finish_restore({}, {});
			return;
		}
		qint64 bytes = 0;
		for (const restore_file &file : restore_data.files)
			bytes += file.byte_size;
		if (QMessageBox::question(
			    this, "Restore from VISP",
			    QString("Download %1 files (%2) and add them as new scene collections and a new profile? Your existing scene collections and profiles are not changed.")
				    .arg(restore_data.files.size())
				    .arg(QLocale().formattedDataSize(bytes))) != QMessageBox::Yes) {
			finish_restore({}, {});
			return;
		}
		restore_dir = std::make_unique<QTemporaryDir>();
		if (!restore_dir->isValid()) {
			finish_restore("Could not create a temporary folder for the download.");
			return;
		}
		restore_index = 0;
		download_next_restore_file();
	}

	void download_next_restore_file()
	{
		if (restore_index >= restore_data.files.size()) {
			import_restore();
			return;
		}
		const plugin_config value = settings();
		const restore_file file = restore_data.files.at(restore_index);
		backup_status.setText(
			QString("Downloading %1 of %2...").arg(restore_index + 1).arg(restore_data.files.size()));
		send(endpoint_url(value.control_url, QString("/api/obs/backups/%1/download-urls").arg(restore_id)),
		     true, {{"paths", QJsonArray{file.path}}}, value.token,
		     [this, file](int status, const QByteArray &body) {
			     const QJsonObject entry =
				     QJsonDocument::fromJson(body).object().value("files").toArray().at(0).toObject();
			     const QUrl download_url(entry.value("url").toString());
			     if (status < 200 || status >= 300 || entry.value("path").toString() != file.path ||
				 !secure_url(download_url.toString())) {
				     finish_restore(response_error(body, "VISP could not prepare a backup download."));
				     return;
			     }
			     download_restore_file(file, download_url);
		     });
	}

	void download_restore_file(const restore_file &file, const QUrl &download_url)
	{
		const QString local_path = restore_dir->filePath(file.path);
		if (!QDir().mkpath(QFileInfo(local_path).absolutePath())) {
			finish_restore("Could not create a temporary folder for the download.");
			return;
		}
		restore_download_file.setFileName(local_path);
		if (!restore_download_file.open(QIODevice::WriteOnly | QIODevice::Truncate)) {
			finish_restore(QString("Could not write %1.").arg(file.path));
			return;
		}
		QNetworkRequest request(download_url);
		request.setTransferTimeout(60'000);
		request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
		QNetworkReply *reply = network.get(request);
		const QString progress_prefix =
			QString("Downloading %1 of %2").arg(restore_index + 1).arg(restore_data.files.size());
		connect(reply, &QNetworkReply::readyRead, this, [this, reply, file]() {
			const QByteArray chunk = reply->readAll();
			if (restore_download_file.size() + chunk.size() > file.byte_size ||
			    restore_download_file.write(chunk) != chunk.size())
				reply->abort();
		});
		connect(reply, &QNetworkReply::downloadProgress, this,
			[this, progress_prefix, total = file.byte_size](qint64 received, qint64) {
				backup_status.setText(QString("%1 (%2%)...")
							      .arg(progress_prefix)
							      .arg(total > 0 ? received * 100 / total : 0));
			});
		connect(reply, &QNetworkReply::finished, this, [this, reply, file]() {
			const int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
			const QByteArray rest = reply->readAll();
			const bool downloaded = reply->error() == QNetworkReply::NoError && status >= 200 &&
						status < 300 && restore_download_file.write(rest) == rest.size();
			const QString error = reply->errorString();
			reply->deleteLater();
			const qint64 size = restore_download_file.size();
			restore_download_file.close();
			if (!downloaded) {
				finish_restore(QString("Downloading %1 failed: %2").arg(file.path, error));
				return;
			}
			if (size != file.byte_size) {
				finish_restore(QString("%1 does not match the backup (wrong size).").arg(file.path));
				return;
			}
			if (file.sha256.isEmpty()) {
				restore_index++;
				download_next_restore_file();
				return;
			}
			backup_status.setText(
				QString("Verifying %1 of %2...").arg(restore_index + 1).arg(restore_data.files.size()));
			hash_file(restore_dir->filePath(file.path), [this, file](const QByteArray &sha256) {
				if (sha256 != file.sha256) {
					finish_restore(
						QString("%1 does not match the backup (checksum).").arg(file.path));
					return;
				}
				restore_index++;
				download_next_restore_file();
			});
		});
	}

	struct restored_scene_collection {
		QString name;
		QJsonObject document;
	};

	// Everything is downloaded and verified; nothing in OBS has changed yet.
	void import_restore()
	{
		backup_status.setText("Importing restored OBS setup...");
		if (obs_outputs_active()) {
			finish_restore(
				"Stop streaming, recording, the replay buffer, and the virtual camera before restoring.");
			return;
		}
		QDir config_root;
		QString error;
		if (!obs_config_root(&config_root, &error)) {
			finish_restore(error);
			return;
		}

		char *media_root =
			obs_module_config_path(QString("restored/%1/media").arg(restore_id).toUtf8().constData());
		const QString media_dir = media_root ? QString::fromUtf8(media_root) : QString();
		bfree(media_root);
		if (media_dir.isEmpty() || !QDir().mkpath(media_dir)) {
			finish_restore("Could not create the restored media folder.");
			return;
		}
		media_path_map media_paths;
		int media_count = 0;
		for (const restore_file &file : restore_data.files) {
			if (!file.path.startsWith("media/"))
				continue;
			const QString destination =
				QDir(media_dir).absoluteFilePath(restored_media_name(file.path, file.original_path));
			QFile::remove(destination);
			if (!QFile::copy(restore_dir->filePath(file.path), destination)) {
				finish_restore(QString("Could not copy restored media to %1.").arg(destination));
				return;
			}
			media_paths.insert(file.original_path, destination);
			media_count++;
		}

		const QDate today = QDate::currentDate();
		QStringList collection_names = take_frontend_list(obs_frontend_get_scene_collections());
		QList<restored_scene_collection> collections;
		QString target_collection;
		int rewritten = 0;
		for (const restore_file &file : restore_data.files) {
			if (!file.path.startsWith("scenes/") || !file.path.endsWith(".json"))
				continue;
			QByteArray contents;
			const QJsonDocument scene_document = read_file(restore_dir->filePath(file.path), &contents)
								     ? QJsonDocument::fromJson(contents)
								     : QJsonDocument();
			if (!scene_document.isObject())
				continue;
			const QString original_scenes_dir =
				QFileInfo(normalized_media_path(file.original_path, {})).path();
			QJsonObject document = rewrite_media_paths(scene_document.object(), media_paths,
								   original_scenes_dir, &rewritten)
						       .toObject();
			const QString original_name =
				document.value("name").toString(QFileInfo(file.path).completeBaseName());
			const QString name = restored_name(original_name, today, collection_names);
			collection_names.append(name);
			document.insert("name", name);
			collections.append({name, document});
			if (target_collection.isEmpty() || original_name == restore_data.scene_collection)
				target_collection = name;
		}

		QString profile_name;
		QString profile_note;
		if (!import_restored_profile(today, &profile_name, &profile_note)) {
			finish_restore(profile_note);
			return;
		}
		if (!collections.isEmpty() && !import_restored_collections(collections, config_root, &error)) {
			finish_restore(error);
			return;
		}
		if (!collections.isEmpty())
			obs_frontend_set_current_scene_collection(target_collection.toUtf8().constData());

		QStringList summary;
		if (!collections.isEmpty())
			summary.append(QString("Restored %1 scene collection%2; now using ‘%3’.")
					       .arg(collections.size())
					       .arg(collections.size() == 1 ? "" : "s")
					       .arg(target_collection));
		else
			summary.append("The backup had no scene collections to restore.");
		if (!profile_note.isEmpty())
			summary.append(profile_note);
		if (media_count > 0)
			summary.append(QString("%1 media file%2 restored to %3.")
					       .arg(media_count)
					       .arg(media_count == 1 ? "" : "s")
					       .arg(QDir::toNativeSeparators(media_dir)));
		summary.append(
			"Stream keys are never backed up: set your stream destination again in Settings → Stream, or use ‘Use this OBS as an output’.");
		finish_restore({}, summary.join("\n\n"));
	}

	// Create a fresh profile, let OBS write it, then replace its basic.ini with the backup's and load it.
	bool import_restored_profile(const QDate &today, QString *profile_name, QString *note)
	{
		QList<restore_file> profiles;
		for (const restore_file &file : restore_data.files) {
			if (file.path.startsWith("profiles/") && file.path.endsWith("/basic.ini"))
				profiles.append(file);
		}
		if (profiles.isEmpty())
			return true;
		QByteArray ini;
		QString original_name;
		for (const restore_file &file : profiles) {
			QByteArray contents;
			if (!read_file(restore_dir->filePath(file.path), &contents))
				continue;
			const QString name = ini_value(contents, "General", "Name");
			if (ini.isEmpty() || (!restore_data.profile.isEmpty() && name == restore_data.profile)) {
				ini = contents;
				original_name = name;
			}
		}
		if (ini.isEmpty()) {
			*note = "Could not read the backed up profile.";
			return false;
		}
		const QString previous = take_frontend_string(obs_frontend_get_current_profile());
		const QString name = restored_name(original_name.isEmpty() ? QString("Profile") : original_name, today,
						   take_frontend_list(obs_frontend_get_profiles()));
		obs_frontend_create_profile(name.toUtf8().constData());
		if (take_frontend_string(obs_frontend_get_current_profile()) != name) {
			*note = "OBS could not create the restored profile.";
			return false;
		}
		const QString profile_dir = take_frontend_string(obs_frontend_get_current_profile_path());
		if (!previous.isEmpty())
			obs_frontend_set_current_profile(previous.toUtf8().constData());
		const QString ini_path = QDir(profile_dir).filePath("basic.ini");
		if (profile_dir.isEmpty() || !write_file(ini_path, set_ini_value(ini, "General", "Name", name))) {
			*note = QString("Created profile ‘%1’, but could not write its settings.").arg(name);
			return false;
		}
		obs_frontend_set_current_profile(name.toUtf8().constData());
		*profile_name = name;
		*note = take_frontend_string(obs_frontend_get_current_profile()) == name
				? QString("Restored profile ‘%1’ and switched to it.").arg(name)
				: QString("Restored profile ‘%1’. Restart OBS and choose it from the Profile menu.")
					  .arg(name);
		return true;
	}

	// OBS only creates scene collections itself, so add empty ones, step back to the
	// previous collection (OBS saves the empty files), then replace those files and load one.
	bool import_restored_collections(const QList<restored_scene_collection> &collections, const QDir &config_root,
					 QString *error)
	{
		const QString previous = take_frontend_string(obs_frontend_get_current_scene_collection());
		for (const restored_scene_collection &collection : collections) {
			if (!obs_frontend_add_scene_collection(collection.name.toUtf8().constData())) {
				*error = QString("OBS could not create scene collection ‘%1’.").arg(collection.name);
				return false;
			}
		}
		if (!previous.isEmpty())
			obs_frontend_set_current_scene_collection(previous.toUtf8().constData());
		QHash<QString, QString> files_by_name;
		const QDir scenes(config_root.filePath("basic/scenes"));
		for (const QFileInfo &scene : scenes.entryInfoList({"*.json"}, QDir::Files)) {
			QByteArray contents;
			if (read_file(scene.absoluteFilePath(), &contents))
				files_by_name.insert(
					QJsonDocument::fromJson(contents).object().value("name").toString(),
					scene.absoluteFilePath());
		}
		for (const restored_scene_collection &collection : collections) {
			const QString path = files_by_name.value(collection.name);
			if (path.isEmpty() ||
			    !write_file(path, QJsonDocument(collection.document).toJson(QJsonDocument::Indented))) {
				*error = QString("Could not write scene collection ‘%1’.").arg(collection.name);
				return false;
			}
		}
		return true;
	}

	void finish_restore(const QString &error, const QString &message = {})
	{
		restore_download_file.close();
		restore_dir.reset();
		restore_in_progress = false;
		set_backup_actions_enabled(!token.text().trimmed().isEmpty() && secure_url(url.text().trimmed()));
		if (!error.isEmpty()) {
			backup_status.setText("Restore failed: " + error);
			QMessageBox::warning(this, "Restore from VISP", error);
			return;
		}
		if (message.isEmpty()) {
			backup_status.clear();
			refresh_backup_presentation();
			return;
		}
		backup_status.setText(message.section("\n\n", 0, 0));
		QMessageBox::information(this, "Restore from VISP", message);
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
		loaded_devices = response.devices;
		devices_loaded = true;
		refresh_output_presentation();
		set_account_status(QString("Connected as %1").arg(response.handle));
		bool rendered_device = false;
		for (const publishing_device &device : response.devices) {
			if (device.id == output_path_id)
				continue;
			rendered_device = true;
			auto *row = new QWidget;
			auto *row_layout = new QHBoxLayout(row);
			row_layout->setContentsMargins(0, 0, 0, 0);
			row_layout->addWidget(new QLabel(
				QString("%1 — %2").arg(device.label, device.publishing ? "live" : "offline")),
				1);
			auto *button = new QPushButton("Add to scene");
			connect(button, &QPushButton::clicked, this,
				[this, id = device.id]() { request_media_source(id); });
			row_layout->addWidget(button);
			devices_layout->addWidget(row);
		}
		if (!rendered_device)
			devices_layout->addWidget(new QLabel("No other publishing devices yet."));
	}

	void refresh_linked_media_sources(const QList<publishing_device> &devices)
	{
		const plugin_config value = settings();
		if (value.token.isEmpty() || !secure_url(value.control_url))
			return;

		QSet<qint64> path_ids;
		for (const publishing_device &device : devices)
			path_ids.insert(device.id);

		path_id_collector collector;
		obs_enum_sources(collect_visp_path_ids, &collector);
		path_ids.unite(collector.ids);

		for (const qint64 path_id : path_ids) {
			send(endpoint_url(value.control_url, QString("/api/obs/devices/%1/source").arg(path_id)),
			     true, {}, value.token, [this](int status, const QByteArray &body) {
				     media_source_response response;
				     if (status < 200 || status >= 300 ||
					 !parse_media_source_response(body, &response))
					     return;
				     QString error;
				     update_media_source(response, &error);
			     });
		}
	}

	void load_devices()
	{
		const plugin_config value = settings();
		if (value.token.isEmpty() || !secure_url(value.control_url)) {
			set_account_status("Sign in or enter a valid pairing token.");
			loaded_devices.clear();
			devices_loaded = false;
			refresh_output_presentation();
			clear_devices();
			return;
		}
		set_account_status("Loading publishing devices...");
		send(endpoint_url(value.control_url, "/api/obs/devices"), false, {}, value.token,
		     [this](int status, const QByteArray &body) {
			     devices_response response;
			     if (status >= 200 && status < 300 && parse_devices_response(body, &response)) {
				     render_devices(response);
				     refresh_linked_media_sources(response.devices);
				     return;
			     }
			     clear_devices();
			     set_account_status(status == 401 ? "Pairing rejected. Sign in again."
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
		show_pairing_code({});
		token.clear();
		loaded_devices.clear();
		devices_loaded = false;
		clear_devices();
		refresh_output_presentation();
		set_account_status("Starting browser sign-in...");
		send(endpoint_url(control_url, "/api/auth/device/code"), true,
		     {{"client_id", "visp-obs"}, {"scope", "obs"}}, {},
		     [this](int status, const QByteArray &body) {
			     device_code_response response;
			     if (status < 200 || status >= 300 || !parse_device_code_response(body, &response)) {
				     set_account_status(response_error(body, "Could not start browser sign-in."));
				     return;
			     }
			     auth_device_code = response.device_code;
			     auth_interval = response.interval;
			     auth_expires_at = QDateTime::currentMSecsSinceEpoch() + qint64(response.expires_in) * 1000;
			     show_pairing_code(format_user_code(response.user_code));
			     set_account_status("Type this code on the VISP page in your browser, then approve:");
			     if (!QDesktopServices::openUrl(response.verification_url))
				     set_account_status(QString("Open %1, type this code, then approve:")
								.arg(response.verification_url.toString()));
			     auth_timer.start(auth_interval * 1000);
		     });
	}

	void poll_device_token()
	{
		if (device_poll_expired(QDateTime::currentMSecsSinceEpoch(), auth_expires_at)) {
			auth_timer.stop();
			show_pairing_code({});
			set_account_status("Browser sign-in expired. Try again.");
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
				     show_pairing_code({});
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
				     show_pairing_code({});
				     set_account_status(response_error(body, "Browser sign-in failed."));
				     break;
			     }
		     });
	}

	void exchange_session(const QString &access_token)
	{
		set_account_status("Finishing VISP connection...");
		send(endpoint_url(url.text().trimmed(), "/api/obs/connect"), true, {}, access_token,
		     [this](int status, const QByteArray &body) {
			     connection_response response;
			     if (status < 200 || status >= 300 || !parse_connection_response(body, &response) ||
				 !secure_url(response.control_url)) {
				     set_account_status(response_error(body, "Could not finish VISP connection."));
				     return;
			     }
			     url.setText(response.control_url);
			     token.setText(response.token);
			     output_path_id = 0;
			     if (!persist_current_settings("VISP connected, but OBS could not save the credential."))
				     return;
			     set_account_status(QString("Connected as %1").arg(response.handle));
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
		loaded_devices.clear();
		devices_loaded = false;
		clear_devices();
		set_account_status({});
		refresh_output_presentation();
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
		loaded_devices.clear();
		devices_loaded = false;
		refresh_output_presentation();
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
	QLabel pairing_code;
	QLabel connection_status;
	QString account_identity;
	QPushButton *sign_in_button = nullptr;
	QPushButton *retry_button = nullptr;
	QPushButton *disconnect_button = nullptr;
	QWidget devices_widget;
	QVBoxLayout *devices_layout = nullptr;
	QLabel output_status;
	QLabel output_guidance;
	QLineEdit device_label;
	QPushButton *configure_output_button = nullptr;
	QLabel backup_status;
	QPushButton *backup_button = nullptr;
	QList<backup_file> backup_files;
	QFile backup_upload_file;
	QString backup_id;
	int backup_index = 0;
	bool backup_in_progress = false;
	QPushButton *restore_button = nullptr;
	bool restore_in_progress = false;
	QString restore_id;
	QDateTime restore_created_at;
	restore_manifest restore_data;
	int restore_index = 0;
	std::unique_ptr<QTemporaryDir> restore_dir;
	QFile restore_download_file;
	QList<publishing_device> loaded_devices;
	bool devices_loaded = false;
	QNetworkAccessManager network;
	QTimer auth_timer;
	QTimer health_timer;
	QString auth_device_code;
	int auth_interval = 5;
	qint64 auth_expires_at = 0;
};

static QStringList scene_names()
{
	QStringList names;
	struct obs_frontend_source_list scenes = {};
	obs_frontend_get_scenes(&scenes);
	for (size_t index = 0; index < scenes.sources.num && names.size() < 256; index++) {
		const QString name = QString::fromUtf8(obs_source_get_name(scenes.sources.array[index]));
		if (!name.isEmpty() && name.size() <= 512)
			names.append(name);
	}
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
	return name.size() <= 512 ? name : QString();
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
		: control_url(settings.control_url),
		  authorization("Bearer " + settings.token.toUtf8()),
		  network(this),
		  socket(this),
		  reconnect_timer(this),
		  socket_timeout(this),
		  report_timer(this),
		  stream_retry_timer(this)
	{
		current_control_state = control_connection_state::connecting;
		reconnect_timer.setSingleShot(true);
		socket_timeout.setSingleShot(true);
		stream_retry_timer.setSingleShot(true);
		report_timer.setInterval(5000);
		connect(&reconnect_timer, &QTimer::timeout, this, [this]() { fetch_ticket(); });
		connect(&socket_timeout, &QTimer::timeout, this,
			[this]() { reconnect("WebSocket connection timed out"); });
		connect(&report_timer, &QTimer::timeout, this, [this]() { heartbeat(); });
		connect(&stream_retry_timer, &QTimer::timeout, this, [this]() {
			stream_start_inflight = false;
			apply_pending_command();
			report_state();
		});
		connect(&socket, &QSslSocket::connected, this, [this]() {
			if (live_url.scheme() == "ws")
				send_handshake();
		});
		connect(&socket, &QSslSocket::encrypted, this, [this]() { send_handshake(); });
		connect(&socket, &QSslSocket::readyRead, this, [this]() { read_socket(); });
		connect(&socket, &QSslSocket::bytesWritten, this, [this](qint64) { flush_writes(); });
		connect(&socket, &QSslSocket::disconnected, this, [this]() {
			if (!stopping && !terminal)
				reconnect("WebSocket disconnected");
		});
		connect(&socket, &QSslSocket::errorOccurred, this, [this](QAbstractSocket::SocketError) {
			if (!stopping && !terminal)
				reconnect("WebSocket connection failed");
		});
		socket.setReadBufferSize(128 * 1024);
		QTimer::singleShot(0, this, [this]() { fetch_ticket(); });
	}

	~VispControl() override
	{
		stopping = true;
		reconnect_timer.stop();
		socket_timeout.stop();
		report_timer.stop();
		stream_retry_timer.stop();
		if (ticket_reply) {
			disconnect(ticket_reply, nullptr, this, nullptr);
			ticket_reply->abort();
		}
		socket.abort();
	}

	void frontend_changed(enum obs_frontend_event event)
	{
		if (event == OBS_FRONTEND_EVENT_STREAMING_STARTED) {
			stream_start_inflight = false;
			stream_retry_attempt = 0;
			stream_retry_timer.stop();
		} else if (event == OBS_FRONTEND_EVENT_STREAMING_STOPPED) {
			const bool wanted =
				has_pending_command && pending_command.desired_streaming;
			if (stream_start_inflight || wanted) {
				stream_start_inflight = false;
				schedule_stream_retry("OBS streaming stopped while VISP still wants it live");
			}
		}
		apply_pending_command();
		report_state();
	}

private:
	void fetch_ticket()
	{
		if (terminal)
			return;
		reconnect_scheduled = false;
		const uint64_t generation = ++ticket_generation;
		QNetworkRequest request(endpoint_url(control_url, "/api/obs/live-ticket"));
		request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
		request.setRawHeader("Authorization", authorization);
		request.setTransferTimeout(5000);
		request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
		QNetworkReply *reply = network.post(request, "{}");
		ticket_reply = reply;
		connect(reply, &QNetworkReply::finished, this, [this, generation, reply]() {
			if (reply != ticket_reply || generation != ticket_generation) {
				reply->deleteLater();
				return;
			}
			ticket_reply = nullptr;
			const int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
			const QByteArray body = reply->readAll();
			const bool transport_ok = reply->error() == QNetworkReply::NoError;
			reply->deleteLater();
			ticket_response ticket;
			const bool valid_ticket = parse_ticket_response(body, &ticket);
			switch (classify_ticket_outcome(status, transport_ok, valid_ticket)) {
			case ticket_request_outcome::sign_in_required:
				obs_log(LOG_ERROR, "VISP pairing credential was rejected");
				require_sign_in();
				return;
			case ticket_request_outcome::retryable:
				reconnect("could not obtain a valid WebSocket ticket");
				return;
			case ticket_request_outcome::accepted:
				break;
			}
			live_url = live_websocket_url(control_url, ticket.ticket);
			if (!live_url.isValid()) {
				reconnect("could not derive WebSocket URL");
				return;
			}
			connect_socket();
		});
	}

	void connect_socket()
	{
		handshake_complete = false;
		awaiting_pong = false;
		read_buffer.clear();
		write_buffer.clear();
		websocket_key = QByteArray(16, Qt::Uninitialized);
		for (char &byte : websocket_key)
			byte = char(QRandomGenerator::system()->generate() & 0xff);
		websocket_key = websocket_key.toBase64();
		socket_timeout.start(10'000);
		const quint16 port = static_cast<quint16>(live_url.port(live_url.scheme() == "wss" ? 443 : 80));
		if (live_url.scheme() == "wss") {
			socket.setPeerVerifyMode(QSslSocket::VerifyPeer);
			socket.setPeerVerifyName(live_url.host());
			socket.connectToHostEncrypted(live_url.host(), port);
		} else {
			socket.connectToHost(live_url.host(), port);
		}
	}

	void send_handshake()
	{
		const QByteArray target = live_url.toEncoded(QUrl::RemoveScheme | QUrl::RemoveAuthority |
							   QUrl::RemoveFragment);
		const QByteArray request = "GET " + target + " HTTP/1.1\r\nHost: " +
					   live_url.authority(QUrl::FullyEncoded).toUtf8() +
					   "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: " +
					   websocket_key + "\r\nSec-WebSocket-Version: 13\r\n\r\n";
		queue_bytes(request);
	}

	void read_socket()
	{
		read_buffer += socket.readAll();
		if (!handshake_complete) {
			const qsizetype end = read_buffer.indexOf("\r\n\r\n");
			if (end < 0) {
				if (read_buffer.size() > 16 * 1024)
					reconnect("WebSocket handshake headers were oversized");
				return;
			}
			const QByteArray headers = read_buffer.first(end + 4);
			read_buffer.remove(0, end + 4);
			if (!valid_websocket_handshake(headers, websocket_key)) {
				reconnect("WebSocket upgrade was rejected");
				return;
			}
			handshake_complete = true;
			socket_timeout.stop();
			reconnect_attempt = 0;
			current_control_state = control_connection_state::connected;
			report_timer.start();
			obs_log(LOG_INFO, "VISP WebSocket connected");
			report_state();
		}
		while (handshake_complete && !read_buffer.isEmpty()) {
			const websocket_frame frame = parse_websocket_frame(read_buffer);
			if (frame.result == websocket_parse_result::incomplete)
				return;
			if (frame.result == websocket_parse_result::error) {
				reconnect("received an invalid WebSocket frame");
				return;
			}
			read_buffer.remove(0, frame.consumed);
			if (frame.result == websocket_parse_result::ping) {
				send_frame(10, frame.payload);
			} else if (frame.result == websocket_parse_result::close) {
				send_frame(8, frame.payload);
				report_timer.stop();
				socket.disconnectFromHost();
				return;
			} else if (frame.result == websocket_parse_result::pong) {
				awaiting_pong = false;
			} else if (frame.result == websocket_parse_result::text) {
				handle_command(frame.payload);
			}
		}
	}

	void handle_command(const QByteArray &body)
	{
		control_response response;
		if (!parse_control_response(body, &response)) {
			reconnect("received an invalid VISP command");
			return;
		}
		if (response.command_version <= applied_version ||
		    (has_pending_command && response.command_version <= pending_command.command_version))
			return;
		const bool streaming_intent_changed =
			!has_pending_command || pending_command.desired_streaming != response.desired_streaming;
		pending_command = response;
		has_pending_command = true;
		if (streaming_intent_changed) {
			stream_retry_attempt = 0;
			stream_retry_timer.stop();
			stream_start_inflight = false;
		}
		apply_pending_command();
	}

	void schedule_stream_retry(const char *reason)
	{
		if (stopping || !has_pending_command || !pending_command.desired_streaming ||
		    stream_retry_timer.isActive() || obs_frontend_streaming_active())
			return;
		const int base = qMin(30'000, 1000 << qMin(stream_retry_attempt++, 5));
		const int delay = base + QRandomGenerator::global()->bounded(251);
		obs_log(LOG_WARNING, "%s; retrying stream start in %d ms", reason, delay);
		stream_retry_timer.start(delay);
	}

	void apply_pending_command()
	{
		if (!has_pending_command || applying_command)
			return;
		applying_command = true;
		if (!pending_command.desired_scene.isNull() && pending_command.desired_scene != current_scene_name() &&
		    !set_current_scene(pending_command.desired_scene)) {
			obs_log(LOG_WARNING, "requested scene is no longer available: %s",
				pending_command.desired_scene.toUtf8().constData());
			// Acknowledge so remotes unlock; desired scene follows the report.
			applied_version = pending_command.command_version;
			has_pending_command = false;
			applying_command = false;
			report_state();
			return;
		}
		const bool active = obs_frontend_streaming_active();
		if (pending_command.desired_streaming != active) {
			if (pending_command.desired_streaming) {
				if (stream_start_inflight || stream_retry_timer.isActive()) {
					applying_command = false;
					return;
				}
				stream_start_inflight = true;
				obs_frontend_streaming_start();
			} else {
				stream_retry_timer.stop();
				stream_retry_attempt = 0;
				stream_start_inflight = false;
				obs_frontend_streaming_stop();
			}
		}
		apply_toggles();
		applying_command = false;
		check_acknowledgement();
	}

	// Non-streaming toggles: flip once toward desired, no retry. OBS emits a
	// frontend event on completion which re-runs apply + report to acknowledge.
	void apply_toggles()
	{
		if (pending_command.desired_recording != obs_frontend_recording_active()) {
			if (pending_command.desired_recording)
				obs_frontend_recording_start();
			else
				obs_frontend_recording_stop();
		}
		if (pending_command.desired_virtual_cam != obs_frontend_virtualcam_active()) {
			if (pending_command.desired_virtual_cam)
				obs_frontend_start_virtualcam();
			else
				obs_frontend_stop_virtualcam();
		}
		if (pending_command.desired_replay_buffer != obs_frontend_replay_buffer_active()) {
			if (pending_command.desired_replay_buffer)
				obs_frontend_replay_buffer_start();
			else
				obs_frontend_replay_buffer_stop();
		}
		// Pause is only meaningful while recording; otherwise the intent is
		// treated as satisfied (see record_paused_reconciled).
		if (obs_frontend_recording_active() &&
		    pending_command.desired_record_paused != obs_frontend_recording_paused())
			obs_frontend_recording_pause(pending_command.desired_record_paused);
	}

	bool record_paused_reconciled() const
	{
		return !obs_frontend_recording_active() ||
		       pending_command.desired_record_paused == obs_frontend_recording_paused();
	}

	void check_acknowledgement()
	{
		if (!has_pending_command || pending_command.desired_streaming != obs_frontend_streaming_active() ||
		    pending_command.desired_recording != obs_frontend_recording_active() ||
		    pending_command.desired_virtual_cam != obs_frontend_virtualcam_active() ||
		    pending_command.desired_replay_buffer != obs_frontend_replay_buffer_active() ||
		    !record_paused_reconciled() ||
		    (!pending_command.desired_scene.isNull() && pending_command.desired_scene != current_scene_name()))
			return;
		applied_version = pending_command.command_version;
		has_pending_command = false;
		report_state();
	}

	void report_state()
	{
		if (!handshake_complete)
			return;
		send_frame(1, make_control_request(obs_frontend_streaming_active(), obs_frontend_recording_active(),
						   obs_frontend_virtualcam_active(), obs_frontend_replay_buffer_active(),
						   obs_frontend_recording_paused(), applied_version, scene_names(),
						   current_scene_name()));
	}

	void heartbeat()
	{
		if (awaiting_pong) {
			reconnect("VISP WebSocket heartbeat timed out");
			return;
		}
		awaiting_pong = true;
		send_frame(9, {});
		report_state();
	}

	void send_frame(quint8 opcode, const QByteArray &payload)
	{
		queue_bytes(make_websocket_frame(opcode, payload, QRandomGenerator::system()->generate()));
	}

	void queue_bytes(const QByteArray &bytes)
	{
		const bool idle = write_buffer.isEmpty();
		write_buffer += bytes;
		if (idle)
			flush_writes();
	}

	void flush_writes()
	{
		if (write_buffer.isEmpty())
			return;
		const qint64 written = socket.write(write_buffer);
		if (written < 0) {
			reconnect("could not write WebSocket data");
			return;
		}
		write_buffer.remove(0, written);
	}

	void reconnect(const char *reason)
	{
		if (stopping || terminal || reconnect_scheduled)
			return;
		current_control_state = control_connection_state::reconnecting;
		reconnect_scheduled = true;
		handshake_complete = false;
		awaiting_pong = false;
		ticket_generation++;
		socket_timeout.stop();
		report_timer.stop();
		if (ticket_reply) {
			disconnect(ticket_reply, nullptr, this, nullptr);
			ticket_reply->abort();
			ticket_reply->deleteLater();
			ticket_reply = nullptr;
		}
		socket.abort();
		write_buffer.clear();
		const int base = qMin(30'000, 1000 << qMin(reconnect_attempt++, 5));
		const int delay = base + QRandomGenerator::global()->bounded(251);
		obs_log(LOG_WARNING, "%s; reconnecting in %d ms", reason, delay);
		reconnect_timer.start(delay);
	}

	void require_sign_in()
	{
		terminal = true;
		current_control_state = control_connection_state::sign_in_required;
		reconnect_scheduled = false;
		handshake_complete = false;
		awaiting_pong = false;
		ticket_generation++;
		reconnect_timer.stop();
		socket_timeout.stop();
		report_timer.stop();
		stream_retry_timer.stop();
		if (ticket_reply) {
			disconnect(ticket_reply, nullptr, this, nullptr);
			ticket_reply->abort();
			ticket_reply->deleteLater();
			ticket_reply = nullptr;
		}
		socket.abort();
		read_buffer.clear();
		write_buffer.clear();
	}

	QString control_url;
	QByteArray authorization;
	QNetworkAccessManager network;
	QSslSocket socket;
	QTimer reconnect_timer;
	QTimer socket_timeout;
	QTimer report_timer;
	QTimer stream_retry_timer;
	QUrl live_url;
	QByteArray websocket_key;
	QByteArray read_buffer;
	QByteArray write_buffer;
	QNetworkReply *ticket_reply = nullptr;
	control_response pending_command = {};
	uint64_t applied_version = 0;
	uint64_t ticket_generation = 0;
	int reconnect_attempt = 0;
	int stream_retry_attempt = 0;
	bool handshake_complete = false;
	bool has_pending_command = false;
	bool applying_command = false;
	bool stream_start_inflight = false;
	bool awaiting_pong = false;
	bool reconnect_scheduled = false;
	bool terminal = false;
	bool stopping = false;
};

static VispControl *control;

static void apply_config(const plugin_config &settings)
{
	delete control;
	control = NULL;
	current_control_state = control_connection_state::inactive;
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
	if (event == OBS_FRONTEND_EVENT_STREAMING_STARTED || event == OBS_FRONTEND_EVENT_STREAMING_STOPPED ||
	    event == OBS_FRONTEND_EVENT_RECORDING_STARTED || event == OBS_FRONTEND_EVENT_RECORDING_STOPPED ||
	    event == OBS_FRONTEND_EVENT_RECORDING_PAUSED || event == OBS_FRONTEND_EVENT_RECORDING_UNPAUSED ||
	    event == OBS_FRONTEND_EVENT_VIRTUALCAM_STARTED || event == OBS_FRONTEND_EVENT_VIRTUALCAM_STOPPED ||
	    event == OBS_FRONTEND_EVENT_REPLAY_BUFFER_STARTED || event == OBS_FRONTEND_EVENT_REPLAY_BUFFER_STOPPED ||
	    event == OBS_FRONTEND_EVENT_SCENE_CHANGED || event == OBS_FRONTEND_EVENT_SCENE_LIST_CHANGED ||
	    event == OBS_FRONTEND_EVENT_SCENE_COLLECTION_CHANGED || event == OBS_FRONTEND_EVENT_FINISHED_LOADING)
		control->frontend_changed(event);
}

const char *obs_module_description(void)
{
	return "Secure VISP remote start and stop control for OBS streaming";
}

bool obs_module_load(void)
{
#if defined(__APPLE__) || defined(_WIN32)
	char *qt_plugins = obs_module_file("qt");
	if (qt_plugins) {
		QCoreApplication::addLibraryPath(QString::fromUtf8(qt_plugins));
		bfree(qt_plugins);
	}
#endif
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
	current_control_state = control_connection_state::inactive;
	obs_log(LOG_INFO, "plugin unloaded");
}

#endif
