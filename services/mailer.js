const path = require('node:path');
const ejs = require('ejs');
const nodemailer = require('nodemailer');

const LAYOUT = path.join(__dirname, '..', 'views', 'emails', 'layout.ejs');
const FROM = process.env.MAIL_FROM || 'Agendal <no-reply@agendal.app>';

// With MAIL_HOST set (Mailpit in development, a real SMTP server in production) mail is sent;
// without it, messages are printed to the console so nothing leaves the machine by accident.
const transport = process.env.MAIL_HOST
  ? nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT) || 587,
      secure: Number(process.env.MAIL_PORT) === 465,
      auth: process.env.MAIL_USERNAME ? { user: process.env.MAIL_USERNAME, pass: process.env.MAIL_PASSWORD } : undefined,
    })
  : nodemailer.createTransport({ jsonTransport: true });

// One email in the Agendal layout, with a plain-text copy for clients that don't show HTML.
// action: { label, url } renders as a button; footnote is the small print underneath;
// footerLinks: [{ label, url }] under the footnote; headers adds raw mail headers (List-Unsubscribe on reminder emails).
async function sendMail({ to, subject, heading, paragraphs, action, footnote, footerLinks = [], headers }) {
  const html = await ejs.renderFile(LAYOUT, { heading, paragraphs, action, footnote, footerLinks });
  const text = [
    heading,
    ...paragraphs,
    action && `${action.label}: ${action.url}`,
    footnote,
    ...footerLinks.map((link) => `${link.label}: ${link.url}`),
  ]
    .filter(Boolean)
    .join('\n\n');

  const info = await transport.sendMail({ from: FROM, to, subject, text, html, headers });
  if (!process.env.MAIL_HOST) console.log(`[mail] to ${to}: ${subject}\n${text}\n`);
  return info;
}

module.exports = { sendMail };
