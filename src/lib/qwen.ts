export async function streamChatWithQwen(
  messages: { role: string; content: string }[],
  onChunk: (chunk: string) => void,
  onDone: (fullText: string) => void,
  onError: (err: Error) => void
) {
  // Use Alibaba Cloud DashScope API endpoint as fallback since internal URL is not provided.
  // We'll use a public URL pattern that the user can replace later via env var.
  const API_URL = process.env.QWEN_API_URL || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';
  const API_KEY = process.env.QWEN_API_KEY || 'dummy_key_please_replace';
  
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({
        model: process.env.QWEN_MODEL || 'qwen-turbo',
        input: {
          messages
        },
        parameters: {
          incremental_output: true,
          result_format: 'message'
        }
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API Error: ${res.status} ${errText}`);
    }

    if (!res.body) throw new Error('No response body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const dataStr = line.slice(5).trim();
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr);
            const chunk = data.output?.choices?.[0]?.message?.content || '';
            if (chunk) {
              fullText += chunk;
              onChunk(chunk);
            }
          } catch (e) {
            // Ignore parse errors for incomplete chunks
          }
        }
      }
    }
    
    onDone(fullText);
  } catch (err: any) {
    console.error('Qwen API Error:', err);
    
    // For demo/fallback purposes if real API fails
    if (err.message.includes('dummy_key') || err.message.includes('API Error: 401') || err.message.includes('API Error: 404')) {
      const mockResponse = `[SYSTEM_WARNING] 大模型连接失败。您好，我是 NexusBot。由于管理员未配置 QWEN_API_KEY，我目前处于离线降级模式。您可以设置环境变量来激活我的神经网络。`;
      
      // Simulate typing effect
      let currentText = '';
      for (let i = 0; i < mockResponse.length; i++) {
        currentText += mockResponse[i];
        onChunk(mockResponse[i]);
        await new Promise(r => setTimeout(r, 20));
      }
      onDone(currentText);
      return;
    }
    
    onError(err);
  }
}
