"""结构约束：HTTP 路由不互相依赖，领域服务不提交请求事务。"""
import ast
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / 'app'


def test_routers_do_not_import_sibling_routers():
    for path in (APP / 'routers').glob('*.py'):
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.ImportFrom):
                assert not (node.module or '').startswith(('routers', 'app.routers')), path.name
            if isinstance(node, ast.Import):
                assert not any('routers.' in alias.name for alias in node.names), path.name


def test_services_leave_transaction_commit_to_callers():
    for path in (APP / 'services').glob('*.py'):
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                assert node.func.attr != 'commit', path.name
