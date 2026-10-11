"""题目投稿审核的服务端持久化及身份权限。"""
import pytest
PAYLOAD={'type':'judge','stem':'加速度是矢量','options':['正确','错误'],'answer':True,'difficulty':1}


def test_student_submission_shared_with_teacher_and_private(client, auth):
    r=client.post('/api/review-questions',json=PAYLOAD,headers=auth('u-1'))
    assert r.status_code==201
    q=r.json();assert q['submittedBy']=='u-1' and q['reviewStatus']=='pending'
    assert q['id'] in [x['id'] for x in client.get('/api/review-questions',headers=auth('teacher','teacher123')).json()]
    assert client.get('/api/review-questions',headers=auth('u-3')).json()==[]
    edited=client.patch('/api/review-questions/'+q['id'],json={'reviewStatus':'approved','teacherFeedback':'表述清楚'},headers=auth('teacher','teacher123'))
    assert edited.status_code==200
    assert client.patch('/api/review-questions/'+q['id'],json={'reviewStatus':None},headers=auth('teacher','teacher123')).status_code==422
    fresh=client.get('/api/review-questions',headers=auth('u-1')).json()[0]
    assert fresh['reviewStatus']=='approved' and fresh['teacherFeedback']=='表述清楚'
    assert client.patch('/api/review-questions/'+q['id'],json={'reviewStatus':'approved'},headers=auth('u-1')).status_code==403


def test_teacher_upload_import_and_delete(client,auth):
    h=auth('teacher','teacher123')
    r=client.post('/api/review-questions/import',json={'questions':[PAYLOAD,PAYLOAD]},headers=h)
    assert r.status_code==200 and r.json()['imported']==1
    q=client.get('/api/review-questions',headers=auth('u-3')).json()[0]
    assert q['submittedBy'] is None and q['reviewStatus']=='approved'
    assert client.delete('/api/review-questions/'+q['id'],headers=auth('u-3')).status_code==403
    assert client.delete('/api/review-questions/'+q['id'],headers=h).status_code==200
    assert client.get('/api/review-questions',headers=h).json()==[]


@pytest.mark.parametrize('patch',[{'answer':2},{'stem':''},{'type':'bad'}])
def test_invalid_questions_rejected(client,auth,patch):
    assert client.post('/api/review-questions',json={**PAYLOAD,**patch},headers=auth('u-1')).status_code==422
