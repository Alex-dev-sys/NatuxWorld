import { motion } from 'framer-motion';
import { LifeBuoy, MessagesSquare, Send, Mail } from 'lucide-react';
import { bridge } from '../services/electron-bridge';

const channels = [
  { icon: MessagesSquare, label: 'Discord', href: 'https://discord.gg/natux', color: '#5865F2' },
  { icon: Send, label: 'Telegram', href: 'https://t.me/natuxworld', color: '#26A5E4' },
  { icon: Mail, label: 'Email', href: 'mailto:support@natux.world', color: '#FF2B4F' },
];

export function SupportPage() {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
      <h1 className="font-display text-4xl tracking-wide">ПОДДЕРЖКА</h1>
      <div className="flex items-center gap-3 rounded-2xl glass p-5">
        <LifeBuoy className="h-8 w-8 text-primary" />
        <div>
          <div className="font-display text-2xl">Нужна помощь?</div>
          <div className="text-sm text-muted">Свяжитесь с нами любым удобным способом</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {channels.map((c) => (
          <button
            key={c.label}
            onClick={() => bridge.shell.openExternal(c.href)}
            className="group flex flex-col items-start gap-3 rounded-2xl glass p-5 text-left hover:border-white/[0.12] transition"
          >
            <c.icon className="h-7 w-7" style={{ color: c.color }} />
            <div>
              <div className="font-display text-xl">{c.label}</div>
              <div className="text-xs text-muted">Открыть →</div>
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
