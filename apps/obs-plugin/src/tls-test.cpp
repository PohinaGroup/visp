#include <QCoreApplication>
#include <QDebug>
#include <QSslSocket>

int main(int argc, char **argv)
{
	QCoreApplication app(argc, argv);
	if (argc != 2)
		return 1;
	// Exclude SDK/host plugins so a missing packaged backend fails this check.
	QCoreApplication::setLibraryPaths({QString::fromLocal8Bit(argv[1])});
	if (!QSslSocket::supportsSsl()) {
		qCritical() << "Packaged TLS backend unavailable; browser sign-in cannot use HTTPS.";
		return 1;
	}
	return 0;
}
