-- Add storage policy for admin uploads to notas-fiscais bucket
CREATE POLICY "Admins can upload invoices"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'notas-fiscais' 
  AND (storage.foldername(name))[1] = 'admin'
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Add policy for admins to read their uploads
CREATE POLICY "Admins can read invoices"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'notas-fiscais'
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Add policy for admins to update their uploads
CREATE POLICY "Admins can update invoices"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'notas-fiscais'
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Add policy for admins to delete their uploads
CREATE POLICY "Admins can delete invoices"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'notas-fiscais'
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);