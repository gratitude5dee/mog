
-- Fix: Drop existing view policies first, then recreate
DROP POLICY IF EXISTS "Anyone can view mog media" ON storage.objects;
CREATE POLICY "Anyone can view mog media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'mog-media');

DROP POLICY IF EXISTS "Anyone can view audio" ON storage.objects;
CREATE POLICY "Anyone can view audio"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'audio');
