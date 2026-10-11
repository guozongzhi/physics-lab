#!/bin/sh
set -e

# 首次启动播种：seed() 幂等（已有数据则跳过），重启不会重复灌入。
# 用 -m 以包方式运行，确保相对导入（from .config 等）可解析。
python -m app.seed
python -m app.upgrade_physics_questions

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
