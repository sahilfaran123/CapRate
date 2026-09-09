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

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header — works whether or not the visitor is signed in */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">CR</span>
            </div>
            <span className="font-bold text-gray-900 text-lg">CapRate</span>
          </Link>
          <Link to="/privacy" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
            Privacy Policy →
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-400 mb-8">Last updated: {LAST_UPDATED}</p>

        {/* Plain-language summary up top — users rarely read the full document */}
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 mb-10">
          <p className="font-semibold text-indigo-900 mb-2 text-sm">The short version</p>
          <ul className="text-sm text-indigo-800 space-y-1.5 leading-relaxed">
            <li>• CapRate is a tool for organizing and analyzing your real estate finances.</li>
            <li>• It is <strong>not</strong> financial, investment, tax, or legal advice — including anything the AI Advisor tells you.</li>
            <li>• Property values and rent estimates come from third parties and are estimates, not appraisals.</li>
            <li>• Verify anything that matters with a qualified professional before acting on it.</li>
            <li>• You own your data and can delete it at any time.</li>
          </ul>
          <p className="text-xs text-indigo-700 mt-3">
            This summary is for convenience only. The full terms below are what legally apply.
          </p>
        </div>

        <Section n="1" title="Acceptance of These Terms">
          <p>
            These Terms of Service (the &ldquo;Terms&rdquo;) form a binding agreement between you and CapRate
            (&ldquo;CapRate&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an account or using the service, you
            confirm that you have read, understood, and agree to be bound by these Terms and by our{' '}
            <Link to="/privacy" className="text-indigo-600 hover:underline">Privacy Policy</Link>.
          </p>
          <p>
            If you do not agree with any part of these Terms, do not create an account or use the service.
          </p>
          <p>
            You must be at least 18 years old and legally able to enter into a contract to use CapRate.
          </p>
        </Section>

        <Section n="2" title="What CapRate Is">
          <p>
            CapRate is a software dashboard that helps real estate investors organize and analyze their
            property and financial information. The service can display account balances and transactions
            from financial institutions you choose to connect, estimated property values and rent figures
            from third-party data providers, and calculated metrics such as cash flow, capitalization rate,
            cash-on-cash return, and equity.
          </p>
          <p>
            CapRate is an informational and organizational tool. It is not a bank, broker-dealer, investment
            adviser, tax preparer, accounting firm, property manager, or law firm, and it does not perform
            any regulated financial, tax, or legal service.
          </p>
        </Section>

        <Section n="3" title="Your Account">
          <p>
            You agree to provide accurate information when registering and to keep it current. You are
            responsible for maintaining the confidentiality of your password and for all activity that occurs
            under your account.
          </p>
          <p>
            Notify us promptly at {CONTACT_EMAIL} if you believe your account has been accessed without your
            authorization. Accounts are for a single user and may not be shared.
          </p>
        </Section>

        <Section n="4" title="Acceptable Use">
          <p>You agree not to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Use the service for any unlawful purpose or in violation of any applicable regulation</li>
            <li>Attempt to access another user&rsquo;s account or data</li>
            <li>Reverse engineer, decompile, scrape, or attempt to extract source code from the service</li>
            <li>Interfere with, disrupt, overload, or probe the service or its infrastructure</li>
            <li>Upload malicious code or attempt to circumvent security or authentication measures</li>
            <li>Resell, sublicense, or commercially redistribute the service without written permission</li>
          </ul>
        </Section>

        <Section n="5" title="The CapRate Advisor (AI Features)">
          <p className="font-semibold text-gray-800">
            Please read this section carefully. It describes important limits on the AI features.
          </p>
          <p>
            The CapRate Advisor is an automated tool that uses artificial intelligence to analyze the
            financial information in your account and answer questions about it. It is <strong>not</strong> a
            licensed financial adviser, investment adviser, tax professional, accountant, or attorney, and no
            advisory relationship of any kind is created by using it.
          </p>
          <p>
            Responses from the Advisor are provided for informational and educational purposes only. They do
            not constitute investment advice, tax advice, legal advice, an offer or solicitation to buy or
            sell any security or property, or a recommendation that any transaction is suitable for you.
          </p>
          <p>
            AI systems can produce output that is incomplete, outdated, or factually incorrect, including
            output that appears confident and precise. We do not warrant the accuracy, completeness, or
            suitability of any Advisor response. You are solely responsible for independently verifying any
            information before relying on it, and you should consult a licensed professional before making
            financial, investment, or tax decisions.
          </p>
          <p>
            Your messages to the Advisor, along with relevant financial context from your account, are
            transmitted to our AI provider for processing. See our{' '}
            <Link to="/privacy" className="text-indigo-600 hover:underline">Privacy Policy</Link> for details.
            Do not enter information you are not comfortable transmitting for processing.
          </p>
        </Section>

        <Section n="6" title="Connected Accounts and Third-Party Data">
          <p>
            CapRate uses Plaid Inc. to connect to financial institutions. When you link an account, your
            credentials are handled by Plaid and are never seen or stored by CapRate. Your use of that
            connection is also governed by Plaid&rsquo;s own terms and privacy policy. You can disconnect a
            linked institution at any time from within the app.
          </p>
          <p>
            Property values, rent estimates, and property characteristics are supplied by third-party data
            providers. This information is licensed to us and provided on an &ldquo;as is&rdquo; basis. We do
            not control it, cannot guarantee its accuracy, and are not responsible for errors, omissions, or
            gaps in coverage. Availability and quality vary by market — some regions, including
            non-disclosure states, may return limited or no data.
          </p>
        </Section>

        <Section n="7" title="Accuracy of Information and Calculations">
          <p>
            <strong>Estimates, not appraisals.</strong> Property valuations shown in CapRate are automated
            estimates. They are not appraisals, broker price opinions, or any form of certified valuation,
            and must not be used as such for lending, insurance, litigation, or tax purposes.
          </p>
          <p>
            <strong>Calculations depend on your inputs.</strong> Metrics such as cash flow, capitalization
            rate, cash-on-cash return, and equity are computed from figures you enter and from third-party
            data. If those inputs are incomplete, outdated, or inaccurate, the resulting figures will be too.
          </p>
          <p>
            <strong>Bank-derived figures are interpretations.</strong> Where you link an account, CapRate
            attempts to identify rent deposits, mortgage payments, and recurring expenses from transaction
            patterns. This detection is automated and may misclassify transactions. Review these figures
            before relying on them.
          </p>
          <p>
            <strong>Tax exports are summaries, not tax filings.</strong> Any income and expense summary,
            depreciation estimate, or similar report generated by CapRate is an informational summary to
            assist you and your tax professional. It is not tax advice, not a completed tax form, and not a
            substitute for professional tax preparation. Mortgage figures reflect total payments; only the
            interest portion is generally deductible, and your lender&rsquo;s year-end statement is the
            authoritative source for that allocation. You are solely responsible for the accuracy of your tax
            filings.
          </p>
        </Section>

        <Section n="8" title="No Professional Advice">
          <p>
            Nothing in the service — including dashboards, metrics, projections, calculators, exports, or AI
            responses — constitutes financial, investment, tax, accounting, or legal advice, and none of it is
            personalized to your particular circumstances, risk tolerance, or objectives.
          </p>
          <p>
            CapRate is not registered as an investment adviser with the U.S. Securities and Exchange
            Commission or with any state securities authority, and does not provide services that require
            such registration. Always consult a qualified, licensed professional before making decisions
            about your finances or property.
          </p>
        </Section>

        <Section n="9" title="Subscriptions and Billing">
          <p>
            CapRate may be offered free of charge or under a paid subscription. Where fees apply, they will
            be disclosed to you before you are charged.
          </p>
          <p>
            Paid subscriptions renew automatically for the same term unless cancelled before the renewal
            date. You may cancel at any time; cancellation takes effect at the end of the current billing
            period, and you retain access until then. Except where required by law, fees already paid are
            non-refundable. We will give reasonable advance notice of any price change, which will take
            effect at your next renewal.
          </p>
        </Section>

        <Section n="10" title="Your Data and Intellectual Property">
          <p>
            You retain ownership of the information you enter into CapRate. You grant us a limited,
            non-exclusive license to store, process, and display that information solely to operate and
            improve the service for you.
          </p>
          <p>
            We may use aggregated, de-identified information that cannot reasonably be linked back to you to
            analyze usage and improve the product.
          </p>
          <p>
            CapRate and its underlying software, design, and branding remain our property. These Terms grant
            you a limited, revocable, non-transferable license to use the service; they do not transfer any
            ownership to you.
          </p>
        </Section>

        <Section n="11" title="Service Availability">
          <p>
            We aim to keep CapRate available and accurate, but the service is provided on an
            &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. We do not guarantee uninterrupted or
            error-free operation.
          </p>
          <p>
            The service depends on third-party providers for hosting, financial data connectivity, property
            data, and AI processing. Interruptions or changes at any of those providers may affect
            availability or the completeness of data shown. We may modify, suspend, or discontinue features
            at any time.
          </p>
        </Section>

        <Section n="12" title="Disclaimer of Warranties">
          <p className="uppercase text-xs tracking-wide text-gray-500 font-semibold">
            To the fullest extent permitted by law:
          </p>
          <p>
            THE SERVICE IS PROVIDED WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY,
            INCLUDING ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY,
            OR NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR
            ERROR-FREE, OR THAT ANY DATA, CALCULATION, ESTIMATE, OR AI-GENERATED RESPONSE WILL BE ACCURATE,
            COMPLETE, OR RELIABLE.
          </p>
        </Section>

        <Section n="13" title="Limitation of Liability">
          <p className="uppercase text-xs tracking-wide text-gray-500 font-semibold">
            To the fullest extent permitted by law:
          </p>
          <p>
            CAPRATE AND ITS OWNERS, OPERATORS, AND SUPPLIERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
            SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOST PROFITS, LOST REVENUE,
            LOST DATA, INVESTMENT LOSSES, TAX PENALTIES, OR BUSINESS INTERRUPTION, ARISING OUT OF OR RELATING
            TO YOUR USE OF OR INABILITY TO USE THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
            DAMAGES.
          </p>
          <p>
            THIS INCLUDES, WITHOUT LIMITATION, LOSSES ARISING FROM DECISIONS MADE IN RELIANCE ON ANY
            VALUATION, CALCULATION, PROJECTION, TAX SUMMARY, TRANSACTION CLASSIFICATION, OR AI-GENERATED
            RESPONSE PROVIDED THROUGH THE SERVICE, AND FROM ANY INACCURACY OR UNAVAILABILITY OF THIRD-PARTY
            DATA.
          </p>
          <p>
            OUR TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS RELATING TO THE SERVICE WILL NOT EXCEED THE GREATER
            OF (A) THE TOTAL AMOUNT YOU PAID US IN THE TWELVE MONTHS BEFORE THE EVENT GIVING RISE TO THE
            CLAIM, OR (B) ONE HUNDRED U.S. DOLLARS ($100).
          </p>
          <p className="text-xs text-gray-500">
            Some jurisdictions do not allow the exclusion of certain warranties or the limitation of certain
            damages. In those jurisdictions, the above limitations apply only to the extent permitted by law,
            and nothing in these Terms limits liability for fraud, willful misconduct, or any liability that
            cannot lawfully be limited.
          </p>
        </Section>

        <Section n="14" title="Indemnification">
          <p>
            You agree to indemnify and hold harmless CapRate and its owners and operators from any claims,
            liabilities, damages, losses, and reasonable legal fees arising out of your use of the service,
            your violation of these Terms, your violation of any law, or your infringement of any third
            party&rsquo;s rights.
          </p>
        </Section>

        <Section n="15" title="Termination">
          <p>
            You may stop using CapRate at any time and may delete your account from the Settings page.
            Deleting your account removes your stored data as described in our{' '}
            <Link to="/privacy" className="text-indigo-600 hover:underline">Privacy Policy</Link>.
          </p>
          <p>
            We may suspend or terminate your access if you materially violate these Terms, if we reasonably
            believe your use creates legal risk or harm to others, or if we discontinue the service. Where
            practical and lawful, we will give you advance notice and an opportunity to export your data.
          </p>
          <p>
            Sections that by their nature should survive termination — including Sections 7, 8, 10, 12, 13,
            14, and 16 — will remain in effect.
          </p>
        </Section>

        <Section n="16" title="Governing Law and Dispute Resolution">
          <p>
            These Terms are governed by the laws of the State of New York, without regard to its conflict of
            laws rules.
          </p>
          <p>
            If a dispute arises, please contact us first at {CONTACT_EMAIL}. Most issues can be resolved
            informally, and we ask that you give us 30 days to try before starting formal proceedings.
          </p>
          <p>
            Any dispute that cannot be resolved informally will be settled by binding individual arbitration
            administered by the American Arbitration Association under its Consumer Arbitration Rules, seated
            in New York, New York. Judgment on the award may be entered in any court of competent
            jurisdiction.
          </p>
          <p>
            <strong>You and CapRate each agree to bring claims only in an individual capacity, and not as a
            plaintiff or class member in any class or representative proceeding.</strong> Either party may
            still bring an individual claim in small claims court. Nothing here prevents either party from
            seeking injunctive relief in court to protect intellectual property or account security.
          </p>
        </Section>

        <Section n="17" title="Changes to These Terms">
          <p>
            We may update these Terms as the service evolves. When we make material changes, we will update
            the date at the top of this page and notify you by email or through the app before the changes
            take effect. Continuing to use CapRate after that date means you accept the revised Terms. If you
            do not agree, you should stop using the service and may delete your account.
          </p>
        </Section>

        <Section n="18" title="General">
          <p>
            These Terms, together with the Privacy Policy, are the entire agreement between you and CapRate
            regarding the service. If any provision is found unenforceable, the remaining provisions stay in
            effect. Our failure to enforce a provision is not a waiver of it. You may not assign these Terms
            without our consent; we may assign them in connection with a merger, acquisition, or sale of
            assets.
          </p>
        </Section>

        <Section n="19" title="Contact">
          <p>
            Questions about these Terms can be sent to{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 hover:underline">{CONTACT_EMAIL}</a>.
          </p>
        </Section>

        <div className="border-t border-gray-200 pt-6 mt-10 flex flex-wrap gap-4 justify-between items-center">
          <Link to="/" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">← Back to CapRate</Link>
          <Link to="/privacy" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">Privacy Policy →</Link>
        </div>
      </div>
    </div>
  );
}
