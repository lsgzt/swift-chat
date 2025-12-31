-- Create storage bucket for chat attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-attachments', 'chat-attachments', true);

-- Create storage policies for chat attachments
CREATE POLICY "Authenticated users can upload chat attachments"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'chat-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Anyone can view chat attachments"
ON storage.objects
FOR SELECT
USING (bucket_id = 'chat-attachments');

CREATE POLICY "Users can delete their own attachments"
ON storage.objects
FOR DELETE
USING (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add file_url column to messages table for attachments
ALTER TABLE public.messages ADD COLUMN file_url TEXT;
ALTER TABLE public.messages ADD COLUMN file_name TEXT;
ALTER TABLE public.messages ADD COLUMN file_type TEXT;