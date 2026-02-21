import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { app } from './firebase';

const storage = getStorage(app);

const sanitizeFileName = (fileName: string) =>
  fileName.replace(/[^a-zA-Z0-9._-]/g, '_');

export const uploadInvoiceLogo = async (file: File): Promise<string> => {
  const safeName = sanitizeFileName(file.name || 'logo.png');
  const filePath = `settings/invoice-metadata/logo-${Date.now()}-${safeName}`;
  const storageRef = ref(storage, filePath);

  await uploadBytes(storageRef, file, {
    contentType: file.type || 'application/octet-stream',
  });

  return getDownloadURL(storageRef);
};
