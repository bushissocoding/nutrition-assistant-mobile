const { validateEmail, validateUsername, validatePassword, normalizeE164 } = require('./identity-model.cjs');

function safeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requireClient(client) {
  if (!client?.auth) throw safeError('AUTH_NOT_CONFIGURED', 'Dịch vụ tài khoản chưa được cấu hình.');
  return client.auth;
}

function toAuthUser(user) {
  return user ? { id: user.id, email: user.email, username: user.user_metadata?.username || null } : null;
}

function createAuthService({ client, callbackUrl = () => '', parseUrl = value => new URL(value) } = {}) {
  return {
    async register({ email, username, password, confirmPassword }) {
      const normalizedEmail = validateEmail(email);
      const normalizedUsername = validateUsername(username);
      if (!normalizedEmail) throw safeError('INVALID_EMAIL', 'Nhập địa chỉ email hợp lệ.');
      if (!normalizedUsername) throw safeError('INVALID_USERNAME', 'Tên người dùng gồm 3–30 chữ cái, số hoặc . _ - .');
      if (!validatePassword(password, confirmPassword)) throw safeError('INVALID_PASSWORD', 'Mật khẩu cần 8–72 ký tự và phải khớp xác nhận.');
      const auth = requireClient(client);
      const { data, error } = await auth.signUp({
        email: normalizedEmail,
        password,
        options: { data: { username: normalizedUsername }, emailRedirectTo: callbackUrl() },
      });
      if (error) throw safeError('REGISTRATION_FAILED', 'Không thể tạo tài khoản. Kiểm tra thông tin hoặc thử lại sau.');
      if (!data?.user) throw safeError('REGISTRATION_UNAVAILABLE', 'Dịch vụ chưa xác nhận được yêu cầu đăng ký. Hãy thử lại.');
      return data.session
        ? { status: 'authenticated', session: data.session, user: toAuthUser(data.user) }
        : { status: 'verification-required' };
    },

    async login({ email, password }) {
      const normalizedEmail = validateEmail(email);
      if (!normalizedEmail) throw safeError('INVALID_EMAIL', 'Nhập địa chỉ email hợp lệ.');
      if (typeof password !== 'string' || !password) throw safeError('INVALID_PASSWORD', 'Nhập mật khẩu.');
      const auth = requireClient(client);
      const { data, error } = await auth.signInWithPassword({ email: normalizedEmail, password });
      if (error || !data?.session || !data.user?.id) throw safeError('LOGIN_FAILED', 'Email hoặc mật khẩu chưa chính xác.');
      return { session: data.session, user: toAuthUser(data.user) };
    },

    async restoreSession() {
      const auth = requireClient(client);
      const { data, error } = await auth.getSession();
      if (error) throw safeError('SESSION_UNAVAILABLE', 'Không thể khôi phục phiên đăng nhập. Hãy thử lại.');
      if (!data?.session?.access_token) return null;
      const { data: verified, error: verifyError } = await auth.getUser(data.session.access_token);
      if (verifyError || !verified?.user?.id) {
        await auth.signOut({ scope: 'local' }).catch(() => undefined);
        return null;
      }
      return { session: data.session, user: toAuthUser(verified.user) };
    },

    async logout() {
      const auth = requireClient(client);
      const { error } = await auth.signOut({ scope: 'local' });
      if (error) throw safeError('LOGOUT_FAILED', 'Không thể đóng phiên an toàn. Hãy thử lại.');
    },

    async requestEmailRecovery(email) {
      const normalizedEmail = validateEmail(email);
      if (!normalizedEmail) throw safeError('INVALID_EMAIL', 'Nhập địa chỉ email hợp lệ.');
      const { error } = await requireClient(client).resetPasswordForEmail(normalizedEmail, { redirectTo: callbackUrl() });
      if (error) throw safeError('RECOVERY_UNAVAILABLE', 'Không thể gửi yêu cầu lúc này. Hãy thử lại sau.');
      return { status: 'accepted' };
    },

    async requestSmsRecovery(value) {
      const phone = normalizeE164(value);
      if (!phone) throw safeError('INVALID_PHONE', 'Nhập số điện thoại quốc tế hợp lệ, ví dụ +84900123456.');
      const { error } = await requireClient(client).signInWithOtp({ phone, options: { shouldCreateUser: false } });
      if (error) throw safeError('RECOVERY_UNAVAILABLE', 'Không thể gửi yêu cầu lúc này. Nếu số điện thoại đã xác minh, hãy thử lại sau.');
      return { status: 'accepted' };
    },

    async verifySmsRecovery({ phone: value, token, password, confirmPassword }) {
      const phone = normalizeE164(value);
      if (!phone) throw safeError('INVALID_PHONE', 'Nhập số điện thoại quốc tế hợp lệ.');
      if (!/^\d{6,8}$/.test(String(token ?? ''))) throw safeError('INVALID_OTP', 'Mã xác nhận không hợp lệ hoặc đã hết hạn.');
      if (!validatePassword(password, confirmPassword)) throw safeError('INVALID_PASSWORD', 'Mật khẩu cần 8–72 ký tự và phải khớp xác nhận.');
      const auth = requireClient(client);
      const { data, error } = await auth.verifyOtp({ phone, token: String(token), type: 'sms' });
      if (error || !data?.session) throw safeError('INVALID_OTP', 'Mã xác nhận không hợp lệ hoặc đã hết hạn.');
      const { error: updateError } = await auth.updateUser({ password });
      if (updateError) throw safeError('PASSWORD_UPDATE_FAILED', 'Không thể cập nhật mật khẩu. Hãy đăng nhập hoặc yêu cầu mã mới.');
      return { status: 'updated' };
    },

    async requestPhoneLink(value) {
      const phone = normalizeE164(value);
      if (!phone) throw safeError('INVALID_PHONE', 'Nhập số điện thoại quốc tế hợp lệ.');
      const { error } = await requireClient(client).updateUser({ phone });
      if (error) throw safeError('PHONE_LINK_FAILED', 'Không thể liên kết số điện thoại. Hãy thử số khác hoặc thử lại sau.');
      return { status: 'verification-required' };
    },

    async verifyPhoneLink({ phone: value, token }) {
      const phone = normalizeE164(value);
      if (!phone || !/^\d{6,8}$/.test(String(token ?? ''))) throw safeError('INVALID_OTP', 'Số điện thoại hoặc mã xác nhận không hợp lệ.');
      const { data, error } = await requireClient(client).verifyOtp({ phone, token: String(token), type: 'phone_change' });
      if (error || data?.user?.phone !== phone || !data?.user?.phone_confirmed_at) throw safeError('INVALID_OTP', 'Số điện thoại hoặc mã xác nhận không hợp lệ.');
      return { status: 'verified', phone };
    },

    async updateRecoveredPassword({ password, confirmPassword }) {
      if (!validatePassword(password, confirmPassword)) throw safeError('INVALID_PASSWORD', 'Mật khẩu cần 8–72 ký tự và phải khớp xác nhận.');
      const { data, error } = await requireClient(client).updateUser({ password });
      if (error || !data?.user?.id) throw safeError('PASSWORD_UPDATE_FAILED', 'Liên kết khôi phục không còn hiệu lực. Hãy yêu cầu đặt lại mật khẩu lần nữa.');
      return { status: 'updated' };
    },

    async completeCallback(url) {
      const auth = requireClient(client);
      let parsed;
      try { parsed = parseUrl(url); } catch { throw safeError('INVALID_CALLBACK', 'Liên kết xác thực không hợp lệ.'); }
      const code = parsed.searchParams?.get('code');
      const hash = new URLSearchParams(String(parsed.hash || '').replace(/^#/, ''));
      if (code) {
        const { error } = await auth.exchangeCodeForSession(code);
        if (error) throw safeError('INVALID_CALLBACK', 'Liên kết xác thực đã hết hạn hoặc không hợp lệ.');
      } else if (hash.get('access_token') && hash.get('refresh_token')) {
        const { error } = await auth.setSession({ access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token') });
        if (error) throw safeError('INVALID_CALLBACK', 'Liên kết xác thực đã hết hạn hoặc không hợp lệ.');
      } else {
        throw safeError('INVALID_CALLBACK', 'Liên kết xác thực không hợp lệ hoặc đã hết hạn.');
      }
      return { status: 'completed' };
    },

    subscribe(listener) {
      const { data } = requireClient(client).onAuthStateChange((event, session) => {
        listener({ event, session, user: toAuthUser(session?.user) });
      });
      return () => data?.subscription?.unsubscribe?.();
    },
  };
}

module.exports = { createAuthService, toAuthUser };
