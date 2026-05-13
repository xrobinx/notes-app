export type TemplateKey = 'class' | 'meeting' | 'project' | 'diary' | 'checklist' | 'study'

export interface NoteTemplate {
  key: TemplateKey
  title: string
  emoji: string
  description: string
  useFor: string
  body: object
  plainText: string
}

const paragraph = (text = '') => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined })
const heading = (text: string, level = 2) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] })
const bulletList = (items: string[]) => ({
  type: 'bulletList',
  content: items.map(text => ({ type: 'listItem', content: [paragraph(text)] })),
})
const checklist = (items: string[]) => ({
  type: 'taskList',
  content: items.map(text => ({
    type: 'taskItem',
    attrs: { checked: false },
    content: [paragraph(text)],
  })),
})

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    key: 'class',
    title: 'Class Notes',
    emoji: '📚',
    description: 'Lecture notes with topic, key points, and follow-up work.',
    useFor: 'School / college',
    plainText: 'Class Notes Topic Key ideas Questions Homework',
    body: {
      type: 'doc',
      content: [
        heading('Class Notes', 1),
        paragraph('Subject:'),
        paragraph('Date:'),
        heading('Main topic', 2),
        paragraph('Write the lesson topic here.'),
        heading('Key ideas', 2),
        bulletList(['Important point', 'Example or formula', 'What the lecturer emphasized']),
        heading('Questions', 2),
        checklist(['Ask about...', 'Review this part again']),
        heading('Homework / next steps', 2),
        checklist(['Complete assignment', 'Revise notes']),
      ],
    },
  },
  {
    key: 'meeting',
    title: 'Meeting Notes',
    emoji: '🗓️',
    description: 'Agenda, decisions, action items, and owners.',
    useFor: 'Work / meetings',
    plainText: 'Meeting Notes Agenda Decisions Action items',
    body: {
      type: 'doc',
      content: [
        heading('Meeting Notes', 1),
        paragraph('Date:'),
        paragraph('People:'),
        heading('Agenda', 2),
        bulletList(['Topic 1', 'Topic 2', 'Topic 3']),
        heading('Decisions', 2),
        checklist(['Decision made', 'Owner confirmed']),
        heading('Action items', 2),
        checklist(['Task - owner - due date', 'Task - owner - due date']),
      ],
    },
  },
  {
    key: 'project',
    title: 'Project Plan',
    emoji: '🚀',
    description: 'Goal, milestones, tasks, risks, and progress.',
    useFor: 'Projects',
    plainText: 'Project Plan Goal Milestones Tasks Risks',
    body: {
      type: 'doc',
      content: [
        heading('Project Plan', 1),
        heading('Goal', 2),
        paragraph('What are we trying to finish?'),
        heading('Milestones', 2),
        checklist(['Milestone 1', 'Milestone 2', 'Milestone 3']),
        heading('Risks', 2),
        bulletList(['Risk', 'Backup plan']),
        heading('Next actions', 2),
        checklist(['First step', 'Second step']),
      ],
    },
  },
  {
    key: 'diary',
    title: 'Diary Entry',
    emoji: '🌙',
    description: 'A calm daily page for thoughts, mood, and memories.',
    useFor: 'Personal journal',
    plainText: 'Diary Entry Today I feel Gratitude Memory Tomorrow',
    body: {
      type: 'doc',
      content: [
        heading('Diary Entry', 1),
        paragraph('Today I feel...'),
        heading('What happened', 2),
        paragraph('Write the moment you want to remember.'),
        heading('Grateful for', 2),
        bulletList(['Something small', 'Someone kind', 'A win']),
        heading('Tomorrow', 2),
        checklist(['One thing to do', 'One thing to let go']),
      ],
    },
  },
  {
    key: 'checklist',
    title: 'Checklist',
    emoji: '✅',
    description: 'Simple task list for errands, packing, or planning.',
    useFor: 'Todos',
    plainText: 'Checklist Things to do',
    body: {
      type: 'doc',
      content: [
        heading('Checklist', 1),
        checklist(['First task', 'Second task', 'Third task']),
      ],
    },
  },
  {
    key: 'study',
    title: 'Study Notes',
    emoji: '🧠',
    description: 'Definitions, examples, active recall, and summary.',
    useFor: 'Studying',
    plainText: 'Study Notes Definitions Examples Questions Summary',
    body: {
      type: 'doc',
      content: [
        heading('Study Notes', 1),
        heading('Definitions', 2),
        bulletList(['Term - meaning', 'Term - meaning']),
        heading('Examples', 2),
        paragraph('Add examples here.'),
        heading('Active recall questions', 2),
        checklist(['Can I explain...', 'Can I solve...']),
        heading('Summary', 2),
        paragraph('One paragraph summary.'),
      ],
    },
  },
]

export function getTemplatesForUse(useKey: string): NoteTemplate[] {
  const map: Record<string, TemplateKey[]> = {
    school: ['class', 'study', 'checklist'],
    work: ['meeting', 'project', 'checklist'],
    personal: ['diary', 'checklist', 'project'],
    projects: ['project', 'meeting', 'checklist'],
  }
  const keys = map[useKey] ?? ['checklist', 'project', 'diary']
  return keys.map(key => NOTE_TEMPLATES.find(template => template.key === key)!).filter(Boolean)
}
