export async function onRequest(context: any) {
  const { request } = context;
  
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
    const requestBody = await request.text();

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json', // 🎯 통신 타입을 application/json 표준 규격으로 선언합니다.
        'Referer': 'https://eledata.koelsa.or.kr/',
        'Origin': 'https://eledata.koelsa.or.kr'
      },
      body: requestBody
    });

    const responseData = await response.text();
    
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