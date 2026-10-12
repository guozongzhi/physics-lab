"""判分不做真值或整数强转；畸形输入按错误答案处理，不触发排序异常。"""


def is_answer_correct(question: dict, user_answer) -> bool:
    qtype = question.get("type")
    answer = question.get("answer")
    if qtype == "multiple":
        if not isinstance(answer, list) or not isinstance(user_answer, list):
            return False
        if not all(type(item) is int for item in answer + user_answer):
            return False
        if len(set(user_answer)) != len(user_answer):
            return False
        return sorted(answer) == sorted(user_answer)
    if qtype == "judge":
        return type(user_answer) is bool and type(answer) is bool and user_answer == answer
    if qtype == "single":
        return type(user_answer) is int and type(answer) is int and user_answer == answer
    return False
