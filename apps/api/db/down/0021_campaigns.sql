-- Denúncias de campanha somem junto: a regra antiga não aceita esse alvo.
DELETE FROM reports WHERE target_type = 'campaign';
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_type_check
  CHECK (target_type IN ('post', 'comment', 'user'));
DROP TRIGGER IF EXISTS campaign_events_append_only ON campaign_events;
DROP FUNCTION IF EXISTS campaign_events_append_only();
DROP TABLE IF EXISTS campaign_events;
DROP TABLE IF EXISTS campaign_entries;
DROP TABLE IF EXISTS campaigns;
