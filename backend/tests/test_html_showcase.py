def test_anonymous_cannot_read_upload_or_like(client):
    assert client.get('/api/showcase').status_code in (401, 403)
    assert client.get('/api/public/showcase').status_code == 404
    assert client.post('/api/showcase', json={}).status_code in (401, 403)
    assert client.post('/api/showcase/guest-public/love').status_code in (401, 403)


def test_html_upload_update_and_review_visibility(client, auth, db):
    html = '<!doctype html><button onclick="this.textContent=42">演示</button>'
    created = client.post('/api/showcase', headers=auth('u-1'), json={
        'title': 'HTML 实验', 'coverImage': '', 'groupId': 'g-1', 'htmlContent': html,
    })
    assert created.status_code == 200, created.text
    sid = created.json()['id']
    assert created.json()['htmlContent'] == html
    assert client.get('/api/showcase', headers=auth('u-3')).json() == []
    assert client.post(f'/api/showcase/{sid}/review', headers=auth('teacher', 'teacher123'), json={'action': 'approve'}).status_code == 200
    assert client.get('/api/showcase', headers=auth('u-3')).json()[0]['htmlContent'] == html
    updated = client.put(f'/api/showcase/{sid}', headers=auth('u-1'), json={'htmlContent': html + '<p>v2</p>'})
    assert updated.status_code == 200
    assert updated.json()['status'] == 'pending'
    assert client.get('/api/showcase', headers=auth('u-3')).json() == []
    assert client.put(f'/api/showcase/{sid}', headers=auth('u-3'), json={'htmlContent': 'bad'}).status_code == 403


def test_html_size_limit(client, auth):
    result = client.post('/api/showcase', headers=auth('u-1'), json={
        'title': 'Too big', 'coverImage': '', 'groupId': 'g-1', 'htmlContent': 'x' * 1_000_001,
    })
    assert result.status_code == 422


def test_html_limit_counts_utf8_bytes_on_create_and_edit(client, auth):
    payload = {'title': '中文演示', 'coverImage': '', 'groupId': 'g-1', 'htmlContent': '汉' * 333334}
    assert client.post('/api/showcase', headers=auth('u-1'), json=payload).status_code == 422
    payload['htmlContent'] = '<p>正常</p>'
    item = client.post('/api/showcase', headers=auth('u-1'), json=payload).json()
    assert client.put(f"/api/showcase/{item['id']}", headers=auth('u-1'), json={'htmlContent': '汉' * 333334}).status_code == 422
    assert client.put(f"/api/showcase/{item['id']}", headers=auth('u-1'), json={'htmlContent': ''}).json()['htmlContent'] == ''
