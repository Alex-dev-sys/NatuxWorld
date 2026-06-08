import { motion } from 'framer-motion';
import { ScrollText } from 'lucide-react';

const rules = [
  { title: 'Запрещены читы и любые модификации, дающие преимущество', sev: 'Бан навсегда' },
  { title: 'Запрещено разжигание ненависти и оскорбления', sev: 'Мут / бан' },
  { title: 'Запрещён рекламный спам в чате', sev: 'Мут 24ч' },
  { title: 'Разрешён PvP в любых биомах кроме спавна', sev: '—' },
  { title: 'Гриф приветствуется в режиме анархии', sev: '—' },
];

export function RulesPage() {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
      <h1 className="font-display text-4xl tracking-wide">ПРАВИЛА</h1>
      <div className="flex flex-col gap-2">
        {rules.map((r, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-3 rounded-xl glass p-4"
          >
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
              <ScrollText className="h-4 w-4" />
            </div>
            <div className="flex-1 text-sm text-white/90">{r.title}</div>
            <span className="rounded-md bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-wider text-muted">
              {r.sev}
            </span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
