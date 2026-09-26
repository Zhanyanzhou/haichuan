import assert from 'node:assert/strict';
import { createServer, type Server, type Socket } from 'node:net';
import { ConfigService } from '@nestjs/config';

export type SmtpCapture = {
  commands: string[];
  message: string;
};

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

export function createLoopbackSmtpConfig(
  port: number,
  overrides: Record<string, string> = {},
): ConfigService {
  const values: Record<string, string> = {
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(port),
    SMTP_USER: 'sandbox-user',
    SMTP_PASS: 'sandbox-password',
    SMTP_FROM: 'Haichuan Sandbox <sender@example.test>',
    ...overrides,
  };
  return {
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  } as ConfigService;
}

export async function startLoopbackSmtpSandbox(options: {
  dropAfterData?: boolean;
  rejectRecipient?: boolean;
} = {}): Promise<{
  port: number;
  capture: SmtpCapture;
  close: () => Promise<void>;
}> {
  const capture: SmtpCapture = { commands: [], message: '' };
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    socket.on('close', () => sockets.delete(socket));

    let buffered = '';
    let receivingData = false;
    const respond = (line: string) => socket.write(`${line}\r\n`);

    socket.on('data', (chunk: string) => {
      buffered += chunk;
      while (true) {
        const lineEnd = buffered.indexOf('\r\n');
        if (lineEnd < 0) break;
        const line = buffered.slice(0, lineEnd);
        buffered = buffered.slice(lineEnd + 2);

        if (receivingData) {
          if (line === '.') {
            receivingData = false;
            if (options.dropAfterData) {
              // DATA 已完整到达但服务端确认回包丢失：发送方不能判断是否已受理。
              socket.destroy();
            } else {
              respond('250 2.0.0 queued as loopback-sandbox');
            }
          } else {
            capture.message += `${line}\r\n`;
          }
          continue;
        }

        capture.commands.push(line);
        const command = line.split(/\s+/, 1)[0]?.toUpperCase();
        switch (command) {
          case 'EHLO':
            socket.write('250-loopback-sandbox\r\n250 AUTH PLAIN LOGIN\r\n');
            break;
          case 'HELO':
            respond('250 loopback-sandbox');
            break;
          case 'AUTH':
            respond('235 2.7.0 authentication successful');
            break;
          case 'MAIL':
            respond('250 2.1.0 accepted');
            break;
          case 'RCPT':
            respond(options.rejectRecipient
              ? '550 5.1.1 recipient rejected'
              : '250 2.1.0 accepted');
            break;
          case 'DATA':
            receivingData = true;
            respond('354 end data with <CR><LF>.<CR><LF>');
            break;
          case 'RSET':
            respond('250 2.0.0 reset');
            break;
          case 'QUIT':
            respond('221 2.0.0 bye');
            socket.end();
            break;
          default:
            respond('502 5.5.2 command not implemented');
        }
      }
    });

    respond('220 loopback-sandbox ESMTP ready');
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  return {
    port: address.port,
    capture,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await closeServer(server);
    },
  };
}
