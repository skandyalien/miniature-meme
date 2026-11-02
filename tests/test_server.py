"""Local API smoke tests; fake AI responses avoid needing an API key."""
import io
import json
import os
import sys
from pathlib import Path

import fitz
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


def pdf_bytes():
    document=fitz.open()
    page=document.new_page()
    page.insert_text((75, 85),'GABA-A modulation and psychiatry essentials')
    page.draw_rect(fitz.Rect(74, 110, 280, 230))
    data=document.tobytes()
    document.close()
    return data


def test_status_and_landing():
    with TestClient(server.app) as client:
        assert client.get('/').status_code == 200
        assert 'LumiQuiz' in client.get('/').text
        assert client.get('/static/app.js').status_code == 200
        assert client.get('/static/styles.css').status_code == 200
        assert client.get('/static/secret').status_code == 404
        assert isinstance(client.get('/api/status').json()['ai_ready'], bool)


def test_upload_page_preview_and_invalid_file():
    with TestClient(server.app) as client:
        invalid=client.post('/api/upload',files={'file':('notes.pdf', b'not a PDF','application/pdf')})
        assert invalid.status_code == 400
        result=client.post('/api/upload',files={'file':('study.pdf',pdf_bytes(),'application/pdf')})
        assert result.status_code == 200, result.text
        doc=result.json()
        assert doc['pages'] == 1 and doc['has_text']
        preview=client.get(f"/api/documents/{doc['document_id']}/pages/1/preview")
        assert preview.status_code == 200 and preview.content.startswith(b'\x89PNG')
        assert client.get(f"/api/documents/{doc['document_id']}/pages/3/preview").status_code == 404


def test_quiz_json_and_stream(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY','sk-test-only')
    async def fake_api(payload):
        if isinstance(payload['input'][0]['content'], str):
            return {'output':[{'type':'message','content':[{'type':'output_text','text':'GABA is inhibitory.'}]}]}
        assert payload['input'][0]['content'][0]['file_data'].startswith('data:application/pdf;base64,')
        assert payload['text']['format']['type'] == 'json_schema'
        n=int(payload['instructions'].split('Create exactly ')[1].split(' distinct')[0])
        questions=[{'question':f'What does GABA question {i+1} mean?',
                    'options':['A','B','C','D'], 'answer_index':1,
                    'hint':'Think about inhibition.', 'explanation':'GABA-A supports inhibition.',
                    'source_page':1,'diagram_page':1,'topic':'Psychiatry'} for i in range(n)]
        return {'output':[{'type':'message','content':[{'type':'output_text','text':json.dumps({'questions':questions})}]}]}
    monkeypatch.setattr(server,'_openai_response',fake_api)
    with TestClient(server.app) as client:
        doc=client.post('/api/upload',files={'file':('study.pdf',pdf_bytes(),'application/pdf')}).json()['document_id']
        body={'document_id':doc,'count':5,'difficulty':'Balanced','include_diagrams':True}
        res=client.post('/api/quiz',json=body)
        assert res.status_code == 200, res.text
        assert len(res.json()['questions']) == 5
        assert res.json()['questions'][0]['diagram_page'] == 1
        body['include_diagrams']=False
        stream=client.post('/api/quiz/stream',json=body)
        assert stream.status_code == 200
        events=[json.loads(line) for line in stream.text.splitlines()]
        assert [e['type'] for e in events]==['progress','batch_complete','result']
        assert events[-1]['questions'][0]['diagram_page'] is None
        assert client.post('/api/quiz',json={**body,'count':41}).status_code == 422
        # Tutor uses same request helper; the mocked response is illustrative only.
        answer=client.post('/api/ask',json={'question':'What is GABA?','answer':'B','explanation':'Inhibitory','user_message':'Explain briefly','document_id':doc,'source_page':1})
        assert answer.status_code == 200
        assert isinstance(answer.json()['answer'],str)


def test_no_key_gives_helpful_error(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY',raising=False)
    with TestClient(server.app) as client:
        doc=client.post('/api/upload',files={'file':('study.pdf',pdf_bytes(),'application/pdf')}).json()['document_id']
        answer=client.post('/api/quiz',json={'document_id':doc,'count':5})
        assert answer.status_code == 503


def test_cloud_authentication_and_readiness(monkeypatch):
    import base64
    monkeypatch.setenv('PRODUCTION','true')
    monkeypatch.delenv('LUMIQUIZ_PASSWORD',raising=False)
    with TestClient(server.app) as client:
        assert client.get('/healthz').status_code == 503
        assert client.get('/').status_code == 503
    monkeypatch.setenv('LUMIQUIZ_PASSWORD','safe-strong-password')
    with TestClient(server.app) as client:
        assert client.get('/healthz').json()['status'] == 'ok'
        unauthenticated=client.get('/')
        assert unauthenticated.status_code == 401
        assert unauthenticated.headers['www-authenticate'].startswith('Basic')
        assert client.post('/api/upload').status_code == 401
        wrong=base64.b64encode(b'lumiquiz:incorrect').decode('ascii')
        assert client.get('/',headers={'Authorization':f'Basic {wrong}'}).status_code == 401
        correct=base64.b64encode(b'lumiquiz:safe-strong-password').decode('ascii')
        response=client.get('/',headers={'Authorization':f'Basic {correct}'})
        assert response.status_code == 200
        assert response.headers['x-content-type-options'] == 'nosniff'
    monkeypatch.delenv('PRODUCTION',raising=False)
