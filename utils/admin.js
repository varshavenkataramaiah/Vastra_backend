const isAdminEmail = (email) => {
  const adminEmails = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((adminEmail) => adminEmail.trim().toLowerCase())
    .filter(Boolean);

  return Boolean(email) && adminEmails.includes(email.toLowerCase());
};

module.exports = { isAdminEmail };
