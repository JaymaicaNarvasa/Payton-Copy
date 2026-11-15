// constants/privacyPolicy.ts
// Single source for the Privacy Policy text (used by app/profile/privacy.tsx).
// Edit the placeholders below before release.

export const LAST_UPDATED = 'November 2026';
export const SUPPORT_EMAIL = 'payton.support@gmail.com';
export const PRIVACY_URL = 'https://payton-privacy.netlify.app/';

export type Block = { kind: 'p'; text: string } | { kind: 'note'; text: string } | { kind: 'li'; items: string[] };
export type Section = { title: string; blocks: Block[] };

export const PRIVACY_SECTIONS: Section[] = [
  {
    title: 'About This Policy',
    blocks: [
      {
        kind: 'p',
        text: 'This Privacy Policy explains what personal information Payton collects, how it is used, who it is shared with, and the choices you have. By creating a Payton account you acknowledge this policy.',
      },
      {
        kind: 'note',
        text: 'Payton does not sell your personal information and does not use it for advertising.',
      },
    ],
  },
  {
    title: 'Information We Collect',
    blocks: [
      { kind: 'p', text: 'We collect only what is needed to run the app:' },
      {
        kind: 'li',
        items: [
          'Account details: your name, email address, role (Personal, Spender or Sponsor) and optional profile photo.',
          'Financial records you enter: income, expenses, budgets, categories, allowances, reminders and optional receipt photos.',
          'Shared-use data: sponsor and spender links, split expenses, and the names and emails of friends you add.',
          'Activity logs: actions such as signing in or out and changes to your records, shown to you under Activity Logs.',
          'Feedback and support messages you send us.',
          'AI usage data: which AI feature was used, the model, status, response time and token counts. This is technical usage data, not the content of your records.',
        ],
      },
      {
        kind: 'p',
        text: 'Payton does not collect card numbers or bank login credentials. It is a tracking tool and does not process or transfer payments.',
      },
    ],
  },
  {
    title: 'How We Use Your Information',
    blocks: [
      {
        kind: 'li',
        items: [
          'To provide the app: show your records, budgets, reminders and shared expenses.',
          'To keep your account secure and detect misuse, using activity logs and audit records.',
          'To provide AI features and Help Desk answers.',
          'To respond to feedback, fix problems and improve Payton.',
        ],
      },
    ],
  },
  {
    title: 'AI Features',
    blocks: [
      {
        kind: 'p',
        text: 'Payton uses Google Gemini to power AI features. When you use the Ask Payton Help Desk chat, only the message you type is sent to the AI service, and the assistant cannot view your balances or transaction history. Other AI features may send the information needed to produce their result.',
      },
      {
        kind: 'p',
        text: 'AI responses can be wrong or incomplete and are general information, not professional financial advice. Please do not type passwords, card numbers or other highly sensitive details into the chat.',
      },
    ],
  },
  {
    title: 'Who We Share Information With',
    blocks: [
      {
        kind: 'p',
        text: 'Within the app, information is shared only as part of arrangements you set up, for example the allowances and expenses visible between a linked sponsor and spender, or the friends included in a split expense.',
      },
      {
        kind: 'p',
        text: 'We use service providers to run Payton: Supabase for sign-in, database and file storage, and Google for AI processing. They process data only to provide those services. We may also disclose information when required by law.',
      },
    ],
  },
  {
    title: 'Storage & Security',
    blocks: [
      {
        kind: 'p',
        text: 'Data is transmitted over encrypted connections and protected with access controls so that you can only access your own records and those shared with you. No system is perfectly secure, so please use a strong, unique password and report any suspected unauthorized access to us.',
      },
    ],
  },
  {
    title: 'Retention & Deleting Your Account',
    blocks: [
      {
        kind: 'p',
        text: 'We keep your information while your account is active. You can export your data at any time from Account > Export Data.',
      },
      {
        kind: 'p',
        text: 'You can permanently delete your account from Account > Delete Account. This removes your profile, photos, financial records, shared-use data, feedback, AI chat and activity logs. Deletion cannot be undone. Copies held in provider backups are removed on their normal backup rotation.',
      },
    ],
  },
  {
    title: 'Your Rights',
    blocks: [
      {
        kind: 'p',
        text: 'You may access and correct your information in the app, export it, delete it, and object to or ask questions about how it is processed. Where the Philippine Data Privacy Act of 2012 applies, you also have the right to be informed, to withdraw consent, and to lodge a complaint with the National Privacy Commission.',
      },
    ],
  },
  {
    title: "Children's Privacy",
    blocks: [
      {
        kind: 'p',
        text: 'Payton is not intended for children under 13. If you believe a child has created an account, contact us and we will delete it.',
      },
    ],
  },
  {
    title: 'Changes & Contact',
    blocks: [
      {
        kind: 'p',
        text: 'We may update this policy as Payton changes. The date above shows the latest version, and we will notify you in the app of significant changes.',
      },
      {
        kind: 'p',
        text: `Questions or requests about your privacy? Email us at ${SUPPORT_EMAIL}.`,
      },
    ],
  },
];
