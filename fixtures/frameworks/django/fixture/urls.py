import hashlib
import hmac
import json
import os
from pathlib import Path

from django.db import connection
from django.http import JsonResponse
from django.urls import path


def health(_request):
	with connection.cursor() as cursor:
		cursor.execute('SELECT 1')
		cursor.fetchone()
	return JsonResponse({'database': 'connected', 'framework': 'django', 'status': 'healthy'})


def persistence(request):
	expected_token = os.environ.get('FRAMEWORK_ACCEPTANCE_TOKEN', '')
	provided_token = request.headers.get('x-framework-acceptance-token', '')
	if not expected_token or not provided_token or not hmac.compare_digest(expected_token, provided_token):
		return JsonResponse({}, status=404)
	marker_path = Path(__file__).resolve().parent.parent / 'media' / 'acceptance-marker.txt'
	if request.method == 'POST':
		try:
			marker = json.loads(request.body).get('marker')
		except (AttributeError, json.JSONDecodeError):
			marker = None
		if not isinstance(marker, str) or not marker or len(marker) > 256:
			return JsonResponse({}, status=422)
		marker_path.parent.mkdir(parents=True, exist_ok=True)
		marker_path.write_text(marker, encoding='utf-8')
	if not marker_path.is_file():
		return JsonResponse({}, status=404)
	checksum = hashlib.sha256(marker_path.read_bytes()).hexdigest()
	return JsonResponse({'checksum': checksum})


urlpatterns = [path('', health), path('persistence', persistence)]
