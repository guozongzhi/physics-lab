import pytest
from app.services import is_answer_correct


@pytest.mark.parametrize('kind,answer,user_answer,expected', [
    ('single',1,1,True), ('single',1,1.9,False), ('single',1,True,False),
    ('single',1,'1',False), ('judge',False,False,True), ('judge',False,[],False),
    ('judge',True,'false',False), ('multiple',[0,2],[2,0],True),
    ('multiple',[0,2],[0,'2'],False), ('multiple',[0,2],[0,2,2],False),
    ('multiple',[0,2],{},False), ('unknown',1,1,False),
])
def test_grading_requires_valid_answer_types(kind,answer,user_answer,expected):
    assert is_answer_correct({'type':kind,'answer':answer},user_answer) is expected
