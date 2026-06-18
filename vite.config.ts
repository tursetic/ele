import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 기존 WFS 레이어용 프록시 통로
      '/api/proxy': {
        target: 'https://eledata.koelsa.or.kr/geoserver/koelsa/ows',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/proxy/, ''),
      },
      // 엘리데이터 통합 검색용 직통 프록시 통로
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