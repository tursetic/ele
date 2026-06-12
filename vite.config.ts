import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 로컬 개발(Vite dev server) 중에 브라우저가 /api/proxy로 요청을 보내면 
      // 컴퓨터가 엘리데이터 실제 주소로 직접 우회시켜 주도록 가상 통로를 뚫어줍니다.
      '/api/proxy': {
        target: 'https://eledata.koelsa.or.kr/geoserver/koelsa/ows',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/proxy/, ''),
      }
    }
  }
});
