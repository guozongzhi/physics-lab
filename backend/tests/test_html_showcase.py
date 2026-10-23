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


def test_multimodal_paper_video_model_and_project_binding(client, auth):
    proj_g1 = client.post('/api/projects', headers=auth('u-1'), json={
        'title': '磁约束实验课题', 'topic': '电磁学',
    }).json()['id']
    proj_g2 = client.post('/api/projects', headers=auth('u-3'), json={
        'title': '异组课题', 'topic': '光学',
    }).json()['id']

    paper = client.post('/api/showcase', headers=auth('u-1'), json={
        'title': '磁场探究论文',
        'coverImage': '',
        'groupId': 'g-1',
        'projectId': proj_g1,
        'category': 'paper',
        'htmlContent': '<!--PAPER_MD--># 摘要\n实验测量数据吻合。',
    })
    assert paper.status_code == 200
    sid = paper.json()['id']
    assert paper.json()['projectId'] == proj_g1
    assert paper.json()['category'] == 'paper'

    # 跨组课题绑定应被拒绝
    bad_update = client.put(f'/api/showcase/{sid}', headers=auth('u-1'), json={'projectId': proj_g2})
    assert bad_update.status_code == 400

    # 切换为 3D 模型并解绑课题
    model_update = client.put(f'/api/showcase/{sid}', headers=auth('u-1'), json={
        'category': 'model',
        'projectId': '',
        'htmlContent': '<!--MODEL_3D:preset-->tokamak',
    })
    assert model_update.status_code == 200
    assert model_update.json()['category'] == 'model'
    assert model_update.json()['projectId'] == ''
    assert model_update.json()['htmlContent'] == '<!--MODEL_3D:preset-->tokamak'

    # 切换为视频载荷（<!--VIDEO_SRC-->）与 OBJ 网格模型（<!--MODEL_3D:obj-->）
    video_update = client.put(f'/api/showcase/{sid}', headers=auth('u-1'), json={
        'category': 'video',
        'htmlContent': '<!--VIDEO_SRC-->https://example.com/demo.mp4',
    })
    assert video_update.status_code == 200
    assert video_update.json()['category'] == 'video'
    assert video_update.json()['htmlContent'] == '<!--VIDEO_SRC-->https://example.com/demo.mp4'

    obj_update = client.put(f'/api/showcase/{sid}', headers=auth('u-1'), json={
        'category': 'model',
        'htmlContent': '<!--MODEL_3D:obj-->v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3',
    })
    assert obj_update.status_code == 200
    assert obj_update.json()['htmlContent'].startswith('<!--MODEL_3D:obj-->')

    # 教师审核通过并授予能量币，随后教师编辑分类/关联课题应保持 approved 状态
    reviewed = client.post(
        f'/api/showcase/{sid}/review',
        headers=auth('teacher', 'teacher123'),
        json={'action': 'approve', 'coins': 15},
    )
    assert reviewed.status_code == 200
    assert reviewed.json()['status'] == 'approved'
    assert reviewed.json()['awardedCoins'] == 15

    teacher_edit = client.put(
        f'/api/showcase/{sid}',
        headers=auth('teacher', 'teacher123'),
        json={'category': 'award', 'projectId': proj_g1},
    )
    assert teacher_edit.status_code == 200
    assert teacher_edit.json()['status'] == 'approved'
    assert teacher_edit.json()['category'] == 'award'
    assert teacher_edit.json()['projectId'] == proj_g1

    # 点赞与取消点赞持久化
    loved = client.post(f'/api/showcase/{sid}/love', headers=auth('u-1')).json()
    assert loved['loves'] == 1 and 'u-1' in loved['lovedBy']
    unloved = client.post(f'/api/showcase/{sid}/love', headers=auth('u-1')).json()
    assert unloved['loves'] == 0 and 'u-1' not in unloved['lovedBy']


def test_video_file_upload_stream_and_validation(client, auth, tmp_path, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, 'video_upload_dir', str(tmp_path))

    # 1. 未登录不可上传
    mp4_bytes = b'\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom' + (b'\x00' * 2048)
    assert client.post(
        '/api/showcase/video',
        files={'file': ('exp.mp4', mp4_bytes, 'video/mp4')},
    ).status_code in (401, 403)

    # 2. 非法后缀或伪造文件头应被拦截
    bad_ext = client.post(
        '/api/showcase/video',
        headers=auth('u-1'),
        files={'file': ('bad.exe', mp4_bytes, 'application/octet-stream')},
    )
    assert bad_ext.status_code == 400

    fake_header = client.post(
        '/api/showcase/video',
        headers=auth('u-1'),
        files={'file': ('fake.mp4', b'<script>alert(1)</script>', 'video/mp4')},
    )
    assert fake_header.status_code == 400

    # 3. 合法 MP4 上传成功并可通过流式接口 + Range 请求读取
    ok = client.post(
        '/api/showcase/video',
        headers=auth('u-1'),
        files={'file': ('pendulum.mp4', mp4_bytes, 'video/mp4')},
    )
    assert ok.status_code == 200, ok.text
    video_url = ok.json()['url']
    assert video_url.startswith('/api/showcase/video/vid_')
    assert ok.json()['size'] == len(mp4_bytes)

    stream_res = client.get(video_url, headers={'Range': 'bytes=0-15'})
    assert stream_res.status_code == 206
    assert len(stream_res.content) == 16

    # 4. 超出上限拦截并自动清理残留文件
    monkeypatch.setattr(settings, 'max_video_bytes', 1024)
    too_large = client.post(
        '/api/showcase/video',
        headers=auth('u-1'),
        files={'file': ('big.mp4', mp4_bytes, 'video/mp4')},
    )
    assert too_large.status_code == 413



