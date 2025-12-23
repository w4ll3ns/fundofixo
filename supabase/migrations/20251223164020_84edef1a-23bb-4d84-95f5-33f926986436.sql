-- Add storage policy for user uploads to notas-fiscais bucket (importados folder)
CREATE POLICY "Users can upload to importados folder"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'notas-fiscais' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Add policy for users to read their own uploads
CREATE POLICY "Users can read own uploads"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'notas-fiscais'
  AND (storage.foldername(name))[1] = auth.uid()::text
);