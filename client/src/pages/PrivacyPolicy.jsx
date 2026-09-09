import { Link } from 'react-router-dom';

const LAST_UPDATED = 'September 7, 2026';
const CONTACT_EMAIL = 'sahilfaran123@gmail.com';

function Section({ n, title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-gray-900 mb-3">{n}. {title}</h2>
      <div className="space-y-3 text-sm text-gray-600 leading-relaxed">{children}</div>
    </section>
  );
}

function Vendor({ name, role, url }) {
  return (
    <li className="mb-2">
      <span className="font-medium text-gray-800">{name}</span> — {role}{' '}
      <a href={url} target="_blank" rel="noopener noreferrer"
         className="text-indigo-600 hover:underline whitespace-nowrap">privacy policy ↗</a>
    </li>
  );
}

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">CR</span>
            </div>
            <span className="font-bold text-gray-900 text-lg">CapRate</span>
          </Link>
          <Link to="/terms" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
            Terms of Service →
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-8">Last updated: {LAST_UPDATED}</p>

        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 mb-10">
          <p className="font-semibold text-indigo-900 mb-2 text-sm">The short version</p>
          <ul className="text-sm text-indigo-800 space-y-1.5 leading-relaxed">
            <li>• We collect what you enter, plus data from accounts you choose to connect.</li>
            <li>• <strong>We never see or store your bank login credentials</strong> — Plaid handles that.</li>
            <li>• We do not sell your data. We do not use it for advertising.</li>
            <li>• Messages to the AI Advisor are sent to Anthropic for processing, along with financial context from your account.</li>
            <li>• You can disconnect any bank or delete your account and data at any time.</li>
          </ul>
          <p className="text-xs text-indigo-700 mt-3">
            This summary is for convenience only. The full policy below is what applies.
          </p>
        </div>

        <Section n="1" title="Who We Are">
          <p>
            CapRate (&ldquo;CapRate&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) provides a software dashboard
            that helps real estate investors organize and analyze their property and financial information.
            This policy explains what personal information we collect, why we collect it, who we share it
            with, and the choices you have.
          </p>
          <p>
            It applies to the CapRate web application and any related services. It does not apply to
            third-party services you connect to CapRate, which are governed by their own policies.
          </p>
        </Section>

        <Section n="2" title="Information You Give Us">
          <p><span className="font-medium text-gray-800">Account information.</span> Your name and email
            address, and a password that we store only as a cryptographic hash (Argon2id). We never store
            your password in a readable form and cannot recover it — we can only reset it.</p>

          <p><span className="font-medium text-gray-800">Property information.</span> Property addresses and
            the financial details you enter about them: purchase price, down payment, purchase date,
            mortgage payment, interest rate, loan term, rent, property tax, insurance, HOA, and maintenance
            figures.</p>

          <p><span className="font-medium text-gray-800">Events you log.</span> Vacancies, one-time expenses,
            and one-time income you record against a property, including any description you write.</p>

          <p><span className="font-medium text-gray-800">AI Advisor conversations.</span> The messages you
            send to the Advisor and the responses it returns, stored so you can revisit past conversations.</p>

          <p><span className="font-medium text-gray-800">Support correspondence.</span> Anything you send us
            by email.</p>
        </Section>

        <Section n="3" title="Information From Connected Accounts">
          <p className="font-semibold text-gray-800">
            CapRate never receives, sees, or stores your bank username or password.
          </p>
          <p>
            When you connect a financial institution, you authenticate directly with Plaid Inc., which
            handles those credentials and returns an access token to us. That token allows us to request
            data — it cannot be used to log in to your bank or to move money. CapRate has read-only access
            and cannot initiate transfers, payments, or any transaction.
          </p>
          <p>Through Plaid we may receive:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Account names, types, masked account numbers (last four digits), and institution names</li>
            <li>Current and available balances</li>
            <li>Transaction history — typically up to six months, including date, amount, merchant, and category</li>
            <li>Investment holdings, quantities, cost basis, and current values, where you connect a brokerage account</li>
          </ul>
          <p>
            We use this to display your accounts, compare expected versus actual property cash flow, detect
            recurring payments such as rent and mortgage, and calculate portfolio metrics. You can disconnect
            any institution at any time from the app, which revokes our access token immediately.
          </p>
        </Section>

        <Section n="4" title="Information From Property Data Providers">
          <p>
            When you add a property, we send its address to RentCast to retrieve estimated market value,
            estimated rent, and property characteristics such as bedrooms, bathrooms, square footage, tax
            assessments, and HOA information where available.
          </p>
          <p>
            We send the property address for this lookup. We do not send your name, email, account balances,
            or any other personal information to property data providers.
          </p>
        </Section>

        <Section n="5" title="Information Collected Automatically">
          <p>
            Like most web services, our infrastructure automatically records technical information when you
            use CapRate: IP address, browser type and version, device and operating system, pages visited,
            timestamps, and error diagnostics. We use this to operate the service, investigate problems, and
            protect against abuse such as automated login attempts.
          </p>
          <p>
            We use a small number of strictly necessary cookies. The main one is an authentication cookie
            that keeps you signed in. It is HTTP-only, meaning it cannot be read by JavaScript in your
            browser, which protects it against common theft techniques. We do not use advertising or
            cross-site tracking cookies.
          </p>
          <p>
            If we enable product analytics to understand which features are used, we will do so in a way that
            focuses on aggregate usage patterns rather than the content of your financial data, and we will
            update this policy before doing so.
          </p>
        </Section>

        <Section n="6" title="How We Use Your Information">
          <p>We use the information described above only to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Create and secure your account and keep you signed in</li>
            <li>Display your dashboard, properties, accounts, and transactions</li>
            <li>Calculate metrics such as cash flow, cap rate, cash-on-cash return, and equity</li>
            <li>Compare your entered estimates against figures derived from linked accounts</li>
            <li>Generate income and expense summaries you request</li>
            <li>Provide the AI Advisor with context so it can answer questions about your portfolio</li>
            <li>Send transactional email such as password resets and welcome messages</li>
            <li>Detect, investigate, and prevent fraud, abuse, and security incidents</li>
            <li>Diagnose errors and improve reliability and performance</li>
            <li>Comply with legal obligations</li>
          </ul>
          <p className="font-semibold text-gray-800">
            We do not sell your personal information. We do not share it with advertisers, data brokers, or
            marketing networks, and we do not use your financial data to target advertising.
          </p>
        </Section>

        <Section n="7" title="The AI Advisor and How Your Data Is Processed">
          <p>
            When you send a message to the CapRate Advisor, we transmit that message together with a summary
            of your financial context to our AI provider, Anthropic, so it can produce a relevant response.
            That context can include account balances, property details and metrics, cash flow figures,
            recent transaction summaries, and events you have logged.
          </p>
          <p>
            We send this because the Advisor cannot answer questions about your portfolio without it. If you
            prefer not to have this information processed by a third party, do not use the Advisor feature —
            the rest of CapRate works without it.
          </p>
          <p>
            Anthropic processes this data as our service provider under its commercial terms. Your
            conversations are stored in our database so you can view your history, and are deleted when you
            delete the conversation or your account.
          </p>
        </Section>

        <Section n="8" title="Who We Share Information With">
          <p>
            We share personal information only with service providers that help us operate CapRate, and only
            to the extent needed for them to perform that function. Each is bound by contractual
            confidentiality and security obligations.
          </p>
          <ul className="list-none pl-0 mt-2">
            <Vendor name="Plaid Inc." role="secure connectivity to financial institutions" url="https://plaid.com/legal/#end-user-privacy-policy" />
            <Vendor name="RentCast" role="property valuation and rental market data" url="https://www.rentcast.io/privacy-policy" />
            <Vendor name="Anthropic" role="AI processing for the CapRate Advisor" url="https://www.anthropic.com/legal/privacy" />
            <Vendor name="MongoDB Atlas" role="encrypted database hosting" url="https://www.mongodb.com/legal/privacy-policy" />
            <Vendor name="Render" role="backend application hosting" url="https://render.com/privacy" />
            <Vendor name="Vercel" role="frontend application hosting" url="https://vercel.com/legal/privacy-policy" />
            <Vendor name="Google (Gmail)" role="delivery of transactional email" url="https://policies.google.com/privacy" />
          </ul>
          <p>We may also disclose information when we believe in good faith that doing so is necessary to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Comply with a law, regulation, subpoena, or other valid legal process</li>
            <li>Enforce our Terms of Service or investigate potential violations</li>
            <li>Protect the rights, property, or safety of our users, the public, or CapRate</li>
          </ul>
          <p>
            If CapRate is involved in a merger, acquisition, or sale of assets, your information may be
            transferred as part of that transaction. We will notify you before your information becomes
            subject to a materially different privacy policy.
          </p>
        </Section>

        <Section n="9" title="How We Protect Your Information">
          <ul className="list-disc pl-5 space-y-1">
            <li>All traffic between your browser and our servers is encrypted using HTTPS</li>
            <li>Passwords are hashed with Argon2id, a memory-hard algorithm designed to resist brute-force attacks</li>
            <li>Authentication uses HTTP-only cookies that JavaScript cannot read</li>
            <li>Bank credentials are never transmitted to or stored by CapRate</li>
            <li>Data is stored in managed, access-controlled infrastructure with encryption at rest</li>
            <li>Sensitive credentials such as API keys are held as encrypted environment variables, never in our source code</li>
            <li>Registration and authentication endpoints are rate-limited against automated attacks</li>
          </ul>
          <p>
            No system is perfectly secure. While we work to protect your information using industry-standard
            practices, we cannot guarantee absolute security. Please use a strong, unique password and notify
            us promptly at {CONTACT_EMAIL} if you suspect unauthorized access to your account.
          </p>
        </Section>

        <Section n="10" title="How Long We Keep Your Information">
          <p>
            We keep your account information for as long as your account is active. Transaction and balance
            data retrieved from connected accounts is retained while the connection is active and refreshed
            periodically.
          </p>
          <p>
            When you delete your account from the Settings page, we delete your profile, properties, logged
            events, Advisor conversations, and stored balance history from our active systems, and we revoke
            the access tokens for any connected institutions. Residual copies may persist in encrypted
            backups for a limited period before being overwritten in the ordinary course. We may retain a
            minimal record where required for legal, tax, or fraud-prevention purposes.
          </p>
          <p>
            Disconnecting an institution without deleting your account revokes our access to that institution
            immediately. Previously retrieved data associated with it is removed from your dashboard.
          </p>
        </Section>

        <Section n="11" title="Your Choices and Rights">
          <p>You can, at any time:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><span className="font-medium text-gray-800">Access</span> your information — everything we hold about your portfolio is visible in the app</li>
            <li><span className="font-medium text-gray-800">Correct</span> it — edit property details and financial inputs directly</li>
            <li><span className="font-medium text-gray-800">Export</span> it — download your income and expense summaries as CSV</li>
            <li><span className="font-medium text-gray-800">Disconnect</span> any linked financial institution</li>
            <li><span className="font-medium text-gray-800">Delete</span> your account and associated data from Settings</li>
            <li><span className="font-medium text-gray-800">Opt out</span> of the AI Advisor simply by not using it</li>
          </ul>
          <p>
            Depending on where you live, you may have additional rights — including the right to request a
            portable copy of your data, to object to or restrict certain processing, or to lodge a complaint
            with a data protection authority. California residents have the right to know what personal
            information is collected and to request deletion, and the right not to be discriminated against
            for exercising those rights. Because we do not sell or share personal information for
            cross-context behavioral advertising, there is nothing to opt out of in that respect.
          </p>
          <p>
            To exercise any of these rights, email {CONTACT_EMAIL}. We will respond within the timeframe
            required by applicable law and may need to verify your identity first.
          </p>
        </Section>

        <Section n="12" title="Children&rsquo;s Privacy">
          <p>
            CapRate is intended for adults managing investment property and is not directed to anyone under
            18. We do not knowingly collect personal information from children. If you believe a child has
            provided us information, contact {CONTACT_EMAIL} and we will delete it.
          </p>
        </Section>

        <Section n="13" title="Where Your Information Is Processed">
          <p>
            CapRate is operated from the United States and our service providers process data primarily in
            the United States. If you access the service from another country, you understand that your
            information will be transferred to and processed in the United States, where data protection laws
            may differ from those in your jurisdiction.
          </p>
        </Section>

        <Section n="14" title="Changes to This Policy">
          <p>
            We may update this policy as CapRate evolves or as legal requirements change. When we make
            material changes — particularly to what we collect or who we share it with — we will update the
            date at the top of this page and notify you by email or in the app before the change takes
            effect. We encourage you to review this page periodically.
          </p>
        </Section>

        <Section n="15" title="Contact Us">
          <p>
            For any question about this policy, to exercise your rights, or to report a privacy concern,
            email{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 hover:underline">{CONTACT_EMAIL}</a>.
          </p>
        </Section>

        <div className="border-t border-gray-200 pt-6 mt-10 flex flex-wrap gap-4 justify-between items-center">
          <Link to="/" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">← Back to CapRate</Link>
          <Link to="/terms" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">Terms of Service →</Link>
        </div>
      </div>
    </div>
  );
}
