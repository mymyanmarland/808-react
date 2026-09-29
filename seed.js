// Seed curriculum from curriculum/*.json — wipes and reseeds path/modules/lessons/steps.
// Usage: node seed.js
import { getDb } from './db.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = getDb();

const PATH = { slug: 'react-basics', title: 'React အခြေခံ', titleEn: 'React Basics', description: 'မြန်မာလိုသင်တဲ့ React အခြေခံသင်ရိုး — အစကနေ Todo App ဆောက်နိုင်တဲ့အထိ', icon: '⚛️' };

db.exec('PRAGMA foreign_keys = OFF');
db.exec('DELETE FROM steps; DELETE FROM lessons; DELETE FROM modules; DELETE FROM paths;');
db.exec('PRAGMA foreign_keys = ON');

db.prepare('INSERT INTO paths (slug, title, title_en, description, icon) VALUES (?, ?, ?, ?, ?)')
  .run(PATH.slug, PATH.title, PATH.titleEn, PATH.description, PATH.icon);

const files = fs.readdirSync(path.join(__dirname, 'curriculum')).filter(f => f.endsWith('.json')).sort();
let modCount = 0, lessonCount = 0, stepCount = 0;
for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'curriculum', f), 'utf8'));
  for (const m of (data.modules || [])) {
    const mr = db.prepare('INSERT INTO modules (path_slug, slug, title, title_en, description, ord) VALUES (?, ?, ?, ?, ?, ?)')
      .run(PATH.slug, m.slug, m.title, m.titleEn || null, m.description || null, m.order || 0);
    modCount++;
    for (const l of (m.lessons || [])) {
      const lr = db.prepare('INSERT INTO lessons (module_id, slug, title, title_en, description, ord) VALUES (?, ?, ?, ?, ?, ?)')
        .run(mr.lastInsertRowid, l.slug, l.title, l.titleEn || null, l.description || null, l.order || 0);
      lessonCount++;
      (l.steps || []).forEach((s, i) => {
        db.prepare('INSERT INTO steps (lesson_id, type, ord, data) VALUES (?, ?, ?, ?)')
          .run(lr.lastInsertRowid, s.type, i, JSON.stringify(s));
        stepCount++;
      });
    }
  }
}
console.log(`Seeded from ${files.length} files: ${modCount} modules, ${lessonCount} lessons, ${stepCount} steps`);
