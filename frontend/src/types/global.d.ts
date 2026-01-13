// TypeScript 类型声明扩展

// Chrome Extension API 类型
declare global {
  interface Window {
    chrome?: {
      runtime?: {
        // 发送消息给当前扩展
        sendMessage: {
          (message: any, responseCallback?: (response: any) => void): void;
          // 发送消息给指定扩展（使用 extension ID）
          (extensionId: string, message: any, responseCallback?: (response: any) => void): void;
        };
        lastError?: {
          message?: string;
        };
        id?: string;
      };
    };
  }
}

export {};
