// utils/exportUtils.ts
import saveAs from 'file-saver';
import toast from 'react-hot-toast';

export const downloadUtil = (fileName) => {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.querySelector('canvas');
      if (!canvas) {
        throw new Error('No canvas found.');
      }

      const image = canvas
        .toDataURL('image/png')
        .replace('image/png', 'image/octet-stream');

      const outputName = `${fileName?.split('.')[0] || 'render'}.png`;
      saveAs(image, outputName);
      resolve();
    } catch (error) {
      reject(error);
    }
  });
};

export const downloadImage = async (fileName) => {
  return toast.promise(downloadImage(fileName), {
    loading: 'Preparing image...',
    success: 'Downloaded!',
    error: (err) => err.toString(),
  });
};