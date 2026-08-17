-- 接口测试完整配置：入参、请求头、Query、Body
ALTER TABLE dfc_api_endpoints
  ADD COLUMN default_test_config_json JSON NULL AFTER default_test_params_json;
