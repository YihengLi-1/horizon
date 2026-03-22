# 地平线 SIS 灾备说明

## 恢复目标
- RTO：4 小时
- RPO：1 小时

## 备份策略
- 备份频率：每日凌晨 2:00 全量备份
- 建议 cron：

```cron
0 2 * * *
```

## 备份脚本
- 脚本路径：`scripts/backup.sh`
- 产物目录：`${BACKUP_DIR:-/tmp/sis-backups}`
- 保留策略：最近 7 天

## 恢复步骤
1. 启动新的 PostgreSQL 实例。
2. 解压并恢复备份：

```bash
gunzip < backup.sql.gz | psql "$DATABASE_URL"
```

3. 更新 `DATABASE_URL` 环境变量。
4. 重启 API 容器：

```bash
docker compose restart api
```

5. 验证恢复结果：

```bash
curl http://localhost:4000/ops/ready
```

## 健康检查
- 端点：`GET /ops/ready`

## 监控
- Prometheus：`http://localhost:9090`
