import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 💡 [치트키] /geoserver로 시작하는 모든 요청을 엘리데이터 공식 망으로 안전하게 우회 중계합니다.
      '/geoserver': {
        target: 'https://eledata.koelsa.or.kr',
        changeOrigin: true,
        secure: false,
      }
    }
  }
});