from django.db import connection
from django.http import JsonResponse
from django.urls import path


def health(_request):
	with connection.cursor() as cursor:
		cursor.execute('SELECT 1')
		cursor.fetchone()
	return JsonResponse({'database': 'connected', 'framework': 'django', 'status': 'healthy'})


urlpatterns = [path('', health)]
