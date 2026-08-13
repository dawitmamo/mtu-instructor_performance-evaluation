import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { EmailDelivery } from '../models/EmailDelivery.js';
import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';

let transporter;
let deliveryTimer;
let deliveryKickTimer;
let deliveryRun;
let deliveryRequested = false;

function approvedAccountFilter() {
  return { $or: [{ registrationStatus: 'APPROVED' }, { registrationStatus: { $exists: false } }] };
}

export function emailDeliveryConfigured() {
  return env.nodeEnv !== 'test' && env.emailNotificationsEnabled && Boolean(env.smtpHost && env.smtpFrom);
}

function mailTransport() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      ...(env.smtpUser && env.smtpPassword ? { auth: { user: env.smtpUser, pass: env.smtpPassword } } : {})
    });
  }
  return transporter;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function queueNotificationEmails(notificationOrId) {
  return queueManyNotificationEmails([notificationOrId]);
}

export async function queueManyNotificationEmails(notifications) {
  const supplied = (notifications || []).filter(Boolean);
  if (!supplied.length) return { queued: 0, sent: 0 };
  const documents = supplied.filter((notification) => notification.audience && notification._id);
  const documentIds = new Set(documents.map((notification) => String(notification._id)));
  const missingIds = supplied
    .filter((notification) => !notification.audience || !notification._id)
    .map((notification) => notification?._id || notification)
    .filter(Boolean);
  if (missingIds.length) {
    const loaded = await Notification.find({ _id: { $in: missingIds } });
    for (const notification of loaded) {
      if (!documentIds.has(String(notification._id))) documents.push(notification);
    }
  }
  if (!documents.length) return { queued: 0, sent: 0 };

  const directUserIds = documents.filter((item) => item.audience === 'USER' && item.user).map((item) => item.user);
  const departmentIds = documents.filter((item) => item.audience === 'DEPARTMENT' && item.department).map((item) => item.department);
  const hasUniversityAudience = documents.some((item) => item.audience === 'UNIVERSITY');
  const recipientClauses = [];
  if (directUserIds.length) recipientClauses.push({ _id: { $in: directUserIds } });
  if (departmentIds.length) recipientClauses.push({ department: { $in: departmentIds }, role: { $in: ['INSTRUCTOR', 'STUDENT'] } });
  if (hasUniversityAudience) recipientClauses.push({ role: { $in: ['INSTRUCTOR', 'STUDENT'] } });
  if (!recipientClauses.length) return { queued: 0, sent: 0 };

  const recipients = await User.find({
    isActive: true,
    $and: [approvedAccountFilter(), { $or: recipientClauses }]
  }).select('_id department role email').lean();
  const recipientsById = new Map(recipients.map((recipient) => [String(recipient._id), recipient]));
  const recipientsByDepartment = new Map();
  const universityRecipients = recipients.filter((recipient) => ['INSTRUCTOR', 'STUDENT'].includes(recipient.role));
  for (const recipient of universityRecipients) {
    const key = String(recipient.department || '');
    if (!recipientsByDepartment.has(key)) recipientsByDepartment.set(key, []);
    recipientsByDepartment.get(key).push(recipient);
  }
  const operations = [];
  for (const notification of documents) {
    const matchedRecipients = notification.audience === 'USER'
      ? [recipientsById.get(String(notification.user))].filter(Boolean)
      : notification.audience === 'DEPARTMENT'
        ? recipientsByDepartment.get(String(notification.department)) || []
        : universityRecipients;
    for (const recipient of matchedRecipients) {
      operations.push({
        updateOne: {
          filter: { notification: notification._id, recipient: recipient._id },
          update: {
            $set: { email: recipient.email },
            $setOnInsert: { notification: notification._id, recipient: recipient._id, status: 'PENDING' }
          },
          upsert: true
        }
      });
    }
  }
  if (!operations.length) return { queued: 0, sent: 0 };
  await EmailDelivery.bulkWrite(operations, { ordered: false });
  scheduleEmailDelivery();
  return { queued: operations.length, sent: 0 };
}

function emailHtml(notification, recipient) {
  const name = [recipient.firstName, recipient.lastName].filter(Boolean).join(' ') || 'MTU community member';
  return `<!doctype html><html><body style="margin:0;background:#eef5f1;font-family:Arial,sans-serif;color:#102033"><div style="max-width:640px;margin:28px auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #d9e7df"><div style="padding:22px 26px;background:#087548;color:#fff"><strong style="font-size:20px">Mizan-Tepi University</strong><div style="margin-top:5px;opacity:.86">Academic Management &amp; Instructor Performance Evaluation System</div></div><div style="padding:26px"><p>Hello ${escapeHtml(name)},</p><h2 style="color:#0b4b31">${escapeHtml(notification.title)}</h2><p style="line-height:1.65;white-space:pre-line">${escapeHtml(notification.message)}</p><p style="margin-top:28px"><a href="${escapeHtml(env.clientOrigin)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#12633f;color:#fff;text-decoration:none;font-weight:bold">Open UAMIPES</a></p><p style="margin-top:25px;color:#65758b;font-size:12px">This automated message was sent to your registered MTU email address.</p></div></div></body></html>`;
}

export async function sendPasswordResetEmail(user, resetToken) {
  if (!emailDeliveryConfigured()) return false;
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'MTU community member';
  const resetUrl = `${env.clientOrigin.replace(/\/+$/, '')}/?resetToken=${encodeURIComponent(resetToken)}`;
  await mailTransport().sendMail({
    from: env.smtpFrom,
    to: user.email,
    subject: '[MTU UAMIPES] Reset your password',
    text: `Hello ${name},\n\nUse this secure link to reset your UAMIPES password within 30 minutes:\n${resetUrl}\n\nIf you did not request this change, ignore this email.`,
    html: `<!doctype html><html><body style="margin:0;background:#eef5f1;font-family:Arial,sans-serif;color:#102033"><div style="max-width:640px;margin:28px auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #d9e7df"><div style="padding:22px 26px;background:#087548;color:#fff"><strong style="font-size:20px">Mizan-Tepi University</strong><div style="margin-top:5px;opacity:.86">Academic Management &amp; Instructor Performance Evaluation System</div></div><div style="padding:26px"><p>Hello ${escapeHtml(name)},</p><h2 style="color:#0b4b31">Reset your password</h2><p style="line-height:1.65">Use the secure link below within 30 minutes. The link can be used only once.</p><p style="margin-top:28px"><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#12633f;color:#fff;text-decoration:none;font-weight:bold">Reset password</a></p><p style="margin-top:25px;color:#65758b;font-size:12px">If you did not request this change, ignore this email.</p></div></div></body></html>`
  });
  return true;
}

export async function deliverPendingEmails({ notificationId, limit = 50 } = {}) {
  if (!emailDeliveryConfigured()) return { sent: 0, failed: 0 };
  const now = new Date();
  await EmailDelivery.updateMany(
    { status: 'SENDING', updatedAt: { $lt: new Date(now.getTime() - env.emailRetryIntervalMs * 2) } },
    { $set: { status: 'FAILED', nextAttemptAt: now, lastError: 'Delivery interrupted before completion' } }
  );
  let sent = 0;
  let failed = 0;
  for (let index = 0; index < limit; index += 1) {
    const delivery = await EmailDelivery.findOneAndUpdate(
      {
        ...(notificationId ? { notification: notificationId } : {}),
        status: { $in: ['PENDING', 'FAILED'] },
        attempts: { $lt: env.emailMaxAttempts },
        $or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: { $lte: new Date() } }]
      },
      { $set: { status: 'SENDING' }, $inc: { attempts: 1 } },
      { new: true, sort: { createdAt: 1 } }
    ).populate('notification').populate('recipient', 'firstName lastName email');
    if (!delivery) break;
    if (!delivery.notification || !delivery.recipient?.email) {
      delivery.status = 'FAILED';
      delivery.lastError = 'Notification or recipient no longer exists';
      delivery.nextAttemptAt = new Date(Date.now() + env.emailRetryIntervalMs);
      await delivery.save();
      failed += 1;
      continue;
    }
    try {
      await mailTransport().sendMail({
        from: env.smtpFrom,
        to: delivery.recipient.email,
        subject: `[MTU UAMIPES] ${delivery.notification.title}`,
        text: `${delivery.notification.title}\n\n${delivery.notification.message}\n\nOpen UAMIPES: ${env.clientOrigin}`,
        html: emailHtml(delivery.notification, delivery.recipient)
      });
      delivery.status = 'SENT';
      delivery.sentAt = new Date();
      delivery.lastError = undefined;
      delivery.nextAttemptAt = undefined;
      await delivery.save();
      sent += 1;
    } catch (error) {
      delivery.status = 'FAILED';
      delivery.lastError = String(error?.message || 'Email delivery failed').slice(0, 1000);
      delivery.nextAttemptAt = new Date(Date.now() + env.emailRetryIntervalMs);
      await delivery.save();
      failed += 1;
    }
  }
  return { sent, failed };
}

function runEmailDeliveryWorker() {
  if (!emailDeliveryConfigured()) return Promise.resolve({ sent: 0, failed: 0 });
  deliveryRequested = true;
  if (deliveryRun) return deliveryRun;
  deliveryRun = (async () => {
    const total = { sent: 0, failed: 0 };
    do {
      deliveryRequested = false;
      let batch;
      do {
        batch = await deliverPendingEmails({ limit: 100 });
        total.sent += batch.sent;
        total.failed += batch.failed;
      } while (batch.sent + batch.failed === 100);
    } while (deliveryRequested);
    return total;
  })().finally(() => { deliveryRun = undefined; });
  return deliveryRun;
}

function scheduleEmailDelivery() {
  if (!emailDeliveryConfigured()) return false;
  deliveryRequested = true;
  if (deliveryRun || deliveryKickTimer) return true;
  deliveryKickTimer = setTimeout(() => {
    deliveryKickTimer = undefined;
    runEmailDeliveryWorker().catch((error) => console.error('Email delivery failed:', error.message));
  }, 0);
  deliveryKickTimer.unref?.();
  return true;
}

export function startEmailDeliveryWorker() {
  if (!emailDeliveryConfigured() || deliveryTimer) return false;
  runEmailDeliveryWorker().catch((error) => console.error('Initial email delivery failed:', error.message));
  deliveryTimer = setInterval(() => {
    runEmailDeliveryWorker().catch((error) => console.error('Email delivery retry failed:', error.message));
  }, env.emailRetryIntervalMs);
  deliveryTimer.unref?.();
  return true;
}
