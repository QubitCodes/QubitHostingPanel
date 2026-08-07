import os


SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'acceptance-only-secret')
DEBUG = False
ALLOWED_HOSTS = ['*']
ROOT_URLCONF = 'fixture.urls'
WSGI_APPLICATION = 'fixture.wsgi.application'
MIDDLEWARE = []
INSTALLED_APPS = []

if os.environ.get('DB_HOST'):
	DATABASES = {
		'default': {
			'ENGINE': 'django.db.backends.postgresql' if os.environ.get('DB_ENGINE') == 'postgresql' else 'django.db.backends.mysql',
			'HOST': os.environ['DB_HOST'],
			'PORT': os.environ.get('DB_PORT', ''),
			'NAME': os.environ['DB_DATABASE'],
			'USER': os.environ['DB_USERNAME'],
			'PASSWORD': os.environ['DB_PASSWORD'],
		}
	}
else:
	DATABASES = {
		'default': {
			'ENGINE': 'django.db.backends.sqlite3',
			'NAME': ':memory:',
		}
	}
