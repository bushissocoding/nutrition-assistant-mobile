const NAMESPACE_KEY = 'nutrition-advisor.demo-namespace.v1';
const namespacePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

class DemoNamespaceStorageError extends Error {
  constructor(message, code, cause) {
    super(message);
    this.name = 'DemoNamespaceStorageError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

function createDefaultDemoNamespace() {
  const randomPart = Math.random().toString(36).slice(2, 12).padEnd(10, '0');
  return `demo-${Date.now().toString(36)}-${randomPart}`;
}

function assertNamespace(value) {
  if (typeof value !== 'string' || !namespacePattern.test(value)) {
    throw new DemoNamespaceStorageError(
      'Không tạo hoặc đọc được mã phiên demo hợp lệ trên thiết bị.',
      'DEMO_NAMESPACE_INVALID',
    );
  }
}

function createDemoNamespaceStore({ storage, createNamespace = createDefaultDemoNamespace } = {}) {
  if (!storage || typeof storage.getItemAsync !== 'function' || typeof storage.setItemAsync !== 'function') {
    throw new TypeError('Demo namespace storage requires async getItemAsync and setItemAsync methods.');
  }

  let namespacePromise;

  async function loadOrCreateNamespace() {
    let stored;
    try {
      stored = await storage.getItemAsync(NAMESPACE_KEY);
    } catch (cause) {
      throw new DemoNamespaceStorageError(
        'Không đọc được mã phiên demo an toàn trên thiết bị. Hãy kiểm tra SecureStore rồi thử lại.',
        'DEMO_NAMESPACE_READ_FAILED',
        cause,
      );
    }

    if (stored !== null && stored !== undefined && stored !== '') {
      assertNamespace(stored);
      return stored;
    }

    let namespace;
    try {
      namespace = createNamespace();
      assertNamespace(namespace);
    } catch (cause) {
      if (cause instanceof DemoNamespaceStorageError) throw cause;
      throw new DemoNamespaceStorageError(
        'Không tạo được mã phiên demo trên thiết bị.',
        'DEMO_NAMESPACE_CREATE_FAILED',
        cause,
      );
    }

    try {
      await storage.setItemAsync(NAMESPACE_KEY, namespace);
    } catch (cause) {
      throw new DemoNamespaceStorageError(
        'Không lưu được mã phiên demo an toàn trên thiết bị. Yêu cầu API chưa được gửi.',
        'DEMO_NAMESPACE_WRITE_FAILED',
        cause,
      );
    }
    return namespace;
  }

  return {
    getNamespace() {
      if (!namespacePromise) {
        namespacePromise = loadOrCreateNamespace().catch(error => {
          namespacePromise = undefined;
          throw error;
        });
      }
      return namespacePromise;
    },
  };
}

module.exports = { DemoNamespaceStorageError, NAMESPACE_KEY, createDefaultDemoNamespace, createDemoNamespaceStore };
