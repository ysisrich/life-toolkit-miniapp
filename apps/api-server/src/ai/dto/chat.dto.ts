export class ChatDto {
  message: string;
  model?: string;
  history?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}
