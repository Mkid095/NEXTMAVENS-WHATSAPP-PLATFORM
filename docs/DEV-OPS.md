# Development Operations

## Quota Reset Commands

### Reset active instances quota for test org

```bash
docker exec nextmavens-whatsapp-postgres psql -U nextmavens -d nextmavens_platform -c "UPDATE quota_usages SET value = 0 WHERE \"orgId\" = 'org_test_001' AND metric = 'active_instances';"
```

Then verify:
```bash
docker exec nextmavens-whatsapp-postgres psql -U nextmavens -d nextmavens_platform -c "SELECT value FROM quota_usages WHERE \"orgId\" = 'org_test_001' AND metric = 'active_instances';"
```
