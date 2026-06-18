export async function onRequest(context: any) {
  const { request } = context;
  
  // 브라우저의 CORS 프리플라이트(OPTIONS) 요청 승인 처리
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      }
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const targetUrl = "https://eledata.koelsa.or.kr/dataManage/select/dataset/NDL250923162856333";

  try {
    // 프런트엔드에서 전송한 본문 문자열을 그대로 확보합니다.
    const requestBody = await request.text();

    // Cloudflare 인프라 권한으로 엘리데이터 대상 서버에 직접 POST 통신을 수행합니다.
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://eledata.koelsa.or.kr/',
        'Origin': 'https://eledata.koelsa.or.kr'
      },
      body: requestBody
    });

    const responseData = await response.text();
    
    // 수집된 정품 JSON 행렬 데이터를 클라이언트에 CORS 허용 헤더와 함께 반환합니다.
    return new Response(responseData, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}