function PrivacyPage() {
    return (
        <div className="min-h-[92vh] flex flex-col items-center py-10 px-6 md:p-12 border-b border-borderColor justify-center">
            <h1 className="text-3xl font-bold mb-4 text-textColor">
                Privacy Policy
            </h1>
            <div className="text-xs text-lightColor mb-8 max-w-[250px] text-center">
                Learn about our privacy practices and how we protect your information.
            </div>
            <div className="w-full max-w-2xl flex flex-col">
                <div className="border border-borderColor rounded p-6 flex flex-col items-start gap-4 bg-white text-xs">
                    <p>This Privacy Policy outlines how Fix It Today Pte. Ltd. collects, processes, and protects your personal data when you use our website <a href="https://www.fixitoday.com" className="underline" target="_blank" rel="noopener noreferrer">www.fixitoday.com</a> and services. By accessing or using the website, you consent to the practices outlined in this Privacy Policy.</p>

                    <h3 className="text-textColor text-sm">Information We Collect</h3>

                    <p>We collect several types of information to provide you with a better experience while using our services. This includes both personal information that you provide to us and usage data that is automatically collected when you visit our website.</p>

                    <h4 className="font-semibold mt-2">Personal Information You Provide</h4>
                    <ul className="list-disc ml-6">
                        <li><b>Account Information:</b> When you create a Creator Account, we collect your full name, email address, phone number, postal address, and age (if applicable). This is required to provide access to our services, process orders, and communicate with you.</li>
                        <li><b>Payment Information:</b> To process purchases, we collect billing information such as your credit or debit card details. These are stored securely by our third-party payment processors and are never stored on our servers.</li>
                        <li><b>User-Generated Content:</b> If you submit designs, content, or product listings, we collect this information to display, process, and fulfil your requests.</li>
                    </ul>

                    <h4 className="font-semibold mt-2">Automatically Collected Data</h4>
                    <ul className="list-disc ml-6">
                        <li><b>Usage Data:</b> We automatically collect technical information such as your IP address, browser type, device information, pages visited, time spent, and other diagnostic data to analyze trends and improve the website.</li>
                        <li><b>Cookies and Tracking Technologies:</b> We use cookies, web beacons, and similar technologies to track your activity. Cookies help us remember your preferences, login details, and items in your cart. You can control cookies via your browser settings.</li>
                    </ul>

                    <h3 className="text-textColor text-sm">How We Use Your Information</h3>

                    <p>The information we collect is used for several purposes to improve the functionality, security, and overall user experience on our website.</p>

                    <h4 className="font-semibold mt-2">Primary Uses of Personal Information</h4>
                    <ul className="list-disc ml-6">
                        <li>Provide Services: To create/manage your account, process orders, and fulfil requests.</li>
                        <li>Process Payments: To process and confirm payments for products/services.</li>
                        <li>Communicate with You: To send emails about your account, orders, and updates. You may also receive newsletters/promotions if opted-in.</li>
                        <li>Customer Support: To respond to inquiries and provide support.</li>
                        <li>Improve Our Services: To enhance the website, customize experience, and analyze trends.</li>
                    </ul>

                    <h4 className="font-semibold mt-2">Secondary Uses of Personal Information</h4>
                    <ul className="list-disc ml-6">
                        <li>Marketing and Advertising: With your consent, we may send marketing communications. You can opt-out anytime.</li>
                        <li>Legal Compliance: To comply with laws, resolve disputes, and enforce agreements.</li>
                    </ul>

                    <h3 className="text-textColor text-sm">Data Sharing and Disclosure</h3>
                    <p>We do not sell or rent your personal information. We may share your data in the following situations:</p>
                    <h4 className="font-semibold mt-2">Third-Party Service Providers</h4>
                    <ul className="list-disc ml-6">
                        <li>Payment Processors: To securely process transactions.</li>
                        <li>Shipping Partners: To deliver products.</li>
                        <li>Marketing and Analytics Providers: To assist in marketing and analytics.</li>
                        <li>Account Management: To help manage your account and support.</li>
                    </ul>
                    <h4 className="font-semibold mt-2">Legal Requirements</h4>
                    <p>We may disclose your information to comply with legal obligations, respond to legal processes, enforce agreements, protect rights/property/safety, or investigate fraud/illegal activities.</p>

                    <h3 className="text-textColor text-sm">Data Retention</h3>
                    <p>We retain your personal information only as long as necessary for the purposes outlined or as required by law. If you close your account or request deletion, we retain data only as required for compliance, dispute resolution, and record-keeping.</p>

                    <h3 className="text-textColor text-sm">Security of Your Information</h3>
                    <p>We implement technical and organizational measures to safeguard your data against unauthorized access, alteration, or destruction, including:</p>
                    <ul className="list-disc ml-6">
                        <li>Encryption: Payment info is transmitted securely (SSL/TLS).</li>
                        <li>Access Control: Only authorized personnel have access.</li>
                    </ul>
                    <p>No method of transmission or storage is 100% secure; we cannot guarantee absolute security.</p>

                    <h3 className="text-textColor text-sm">Your Rights Regarding Personal Information</h3>
                    <ul className="list-disc ml-6">
                        <li>Access: Request a copy of your personal data.</li>
                        <li>Correction: Request corrections to inaccurate/incomplete data.</li>
                        <li>Deletion: Request deletion, subject to legal exceptions.</li>
                        <li>Opt-Out of Marketing: Unsubscribe via email link or account settings.</li>
                        <li>Withdraw Consent: Withdraw consent for processing at any time.</li>
                    </ul>
                    <p>To exercise these rights, contact us at <a href="mailto:fixittoday.contact@gmail.com" className=" underline">fixittoday.contact@gmail.com</a>.</p>

                    <h3 className="text-textColor text-sm">Cookies and Tracking Technologies</h3>
                    <p>We use cookies for user experience, analytics, and marketing.</p>
                    <h4 className="font-semibold mt-2">Types of Cookies We Use</h4>
                    <ul className="list-disc ml-6">
                        <li>Necessary Cookies: Essential for website operation.</li>
                        <li>Performance and Analytics Cookies: Track visitor interaction and improve performance.</li>
                        <li>Targeting and Advertising Cookies: Provide targeted ads based on browsing behaviour.</li>
                    </ul>
                    <p>You can manage cookie preferences via your browser. Disabling some cookies may impact website features.</p>

                    <h3 className="text-textColor text-sm">International Transfers</h3>
                    <p>We may transfer/store your data outside Singapore. By using the website, you consent to such transfers, subject to this Privacy Policy.</p>

                    <h3 className="text-textColor text-sm">Changes to This Privacy Policy</h3>
                    <p>We may update this policy from time to time. Changes will be posted here and are effective immediately. Please review periodically for updates.</p>

                    <h3 className="text-textColor text-sm">Contact Information</h3>
                    <p>If you have questions or wish to exercise your rights, contact us at:</p>
                    <div className='w-full flex items-center'>
                        <p><b>Fix It Today Pte. Ltd.</b><br />Email: <a href="mailto:fixittoday.contact@gmail.com" className=" underline">fixittoday.contact@gmail.com</a></p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default PrivacyPage