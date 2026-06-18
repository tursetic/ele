import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/proxy': {
        target: 'https://eledata.koelsa.or.kr/geoserver/koelsa/ows',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/proxy/, ''),
      },
      '/api/search': {
        target: 'https://eledata.koelsa.or.kr',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => '/dataManage/select/dataset/NDL250923162856333',
        headers: {
          'Origin': 'https://eledata.koelsa.or.kr',
          'Referer': 'https://eledata.koelsa.or.kr/'
        }
      }
    }
  }
});