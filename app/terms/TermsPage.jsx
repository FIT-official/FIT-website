import React from 'react'

function TermsPage() {
    return (
        <div className="min-h-[92vh] flex flex-col items-center py-10 px-6 md:p-12 border-b border-borderColor justify-center">
            <h1 className="text-3xl font-bold mb-4 text-textColor">
                Terms of Service
            </h1>
            <div className="text-xs text-lightColor mb-8 max-w-[250px] text-center">
                Learn about our terms and conditions for using our services.
            </div>
            <div className="w-full max-w-2xl flex flex-col">
                <div className="border border-borderColor rounded p-6 flex flex-col items-start gap-4 bg-white text-xs">
                    <h2 className="text-base font-semibold mb-2">Terms and Conditions</h2>
                    <p>These Terms and Conditions ("Agreement") govern your use of the Website <a href="https://www.fixitoday.com" className="underline" target="_blank" rel="noopener noreferrer">www.fixitoday.com</a> and the services offered by Fix It Today Pte. Ltd. By accessing or using our Website and services, you agree to be bound by these terms. If you do not agree with these terms, you are not permitted to use this Website.</p>

                    <h3 className="text-textColor text-sm mt-4">Definitions</h3>
                    <ul className="list-disc ml-6">
                        <li><b>User:</b> Any individual or entity that accesses or uses the services provided by Fix It Today Pte. Ltd.</li>
                        <li><b>Services:</b> Includes 3D printing, retail sale of 3D printer parts/accessories, repair/maintenance, and custom manufacturing (e.g., laser cutting, dot punching).</li>
                        <li><b>Product:</b> Any products listed or sold on the Website, including 3D prints, parts, and accessories.</li>
                        <li><b>Account:</b> The user profile created upon registration, required to access certain features.</li>
                    </ul>

                    <h3 className="text-textColor text-sm mt-4">Creator Rights and Responsibilities</h3>
                    <h4 className="font-semibold mt-2">Eligibility</h4>
                    <p>By creating an Account (Creator Account), you confirm you have legal capacity to form a binding contract. If using on behalf of an entity, you warrant you have authority to bind that entity.</p>

                    <h4 className="font-semibold mt-2">Creator Account Registration</h4>
                    <ul className="list-disc ml-6">
                        <li><b>Creation of Creator Account:</b> Required for purchasing, submitting designs, or listing products. You agree to provide accurate, current, and complete info and keep it updated.</li>
                        <li><b>Creator Account Security:</b> You are responsible for maintaining confidentiality of credentials. Notify us immediately of unauthorized use or security breach.</li>
                        <li><b>Access Restrictions:</b> Do not share credentials. Actions under your account are your responsibility.</li>
                    </ul>

                    <h4 className="font-semibold mt-2">Acceptable Use</h4>
                    <ul className="list-disc ml-6">
                        <li><b>Lawful Use:</b> Use only for lawful purposes. Do not damage, disable, overburden, or impair the Website or interfere with others.</li>
                        <li><b>Prohibited Conduct:</b> Do not:
                            <ul className="list-disc ml-6">
                                <li>Upload/post/transmit harmful, illegal, abusive, defamatory, or infringing content.</li>
                                <li>Attempt unauthorized access to any Website portion, other accounts, or interfere with security/integrity.</li>
                                <li>Use automated systems for data extraction/scraping without written consent.</li>
                                <li>Violate any applicable law or regulation.</li>
                            </ul>
                        </li>
                    </ul>

                    <h4 className="font-semibold mt-2">Creator-Generated Content and Listings</h4>
                    <ul className="list-disc ml-6">
                        <li><b>Design Ownership:</b> You retain ownership of submitted designs, but grant Fix It Today Pte. Ltd. a worldwide, royalty-free, non-exclusive license to reproduce, display, and distribute for order fulfilment/services.</li>
                        <li><b>Responsibility for Content:</b> You are solely responsible for all content, designs, and listings. Ensure originality, non-infringement, and legal compliance.</li>
                        <li><b>Prohibited Content:</b> Do not upload/post content infringing third-party rights. We may remove any content at our discretion if it violates these terms or does not fit the Website.</li>
                        <li><b>Content Categories:</b> Products must align with their listed category. Selling outside designated categories is prohibited. We may remove non-compliant products at our discretion.</li>
                    </ul>

                    <h4 className="font-semibold mt-2">Communication and Consent</h4>
                    <ul className="list-disc ml-6">
                        <li><b>Notifications:</b> By creating an account and using services, you agree to receive notifications via email or other channels about updates, promotions, and changes.</li>
                        <li><b>Consent to Communication:</b> By providing contact details, you consent to notifications about orders, recommendations, and service matters. You also consent to promotional offers/newsletters unless you opt-out.</li>
                    </ul>

                    <h4 className="font-semibold mt-2">Compliance with Laws</h4>
                    <p>You agree to comply with all applicable laws, regulations, and industry standards, including data protection and intellectual property laws. Fix It Today Pte. Ltd. is not responsible for ensuring your content complies with these laws.</p>

                    <h4 className="font-semibold mt-2">Liability for Creator Actions</h4>
                    <p>You are solely responsible for actions/transactions under your account. Fix It Today Pte. Ltd. is not responsible for losses, damages, or liabilities due to your failure to maintain confidentiality or misuse of the Website.</p>

                    <h3 className="text-textColor text-sm mt-4">Payment and Transactions</h3>
                    <h4 className="font-semibold mt-2">Payment Information</h4>
                    <ul className="list-disc ml-6">
                        <li><b>Payment Methods:</b> Payments accepted via credit/debit cards and local options. All payments processed securely; sensitive info not stored.</li>
                        <li><b>Payment Processing:</b> Payments processed in SGD unless stated otherwise. You authorize charges for order total, taxes, shipping, and other fees.</li>
                        <li><b>Billing Information:</b> Provide accurate billing details during checkout. You are responsible for accuracy.</li>
                    </ul>

                    <h4 className="font-semibold mt-2">Order Confirmation and Payment Processing</h4>
                    <ul className="list-disc ml-6">
                        <li><b>Order Confirmation:</b> After successful payment, you receive a confirmation email with order details, total price, and delivery timeline.</li>
                        <li><b>Order Processing:</b> Orders are processed after payment confirmation. Issues will be notified by email.</li>
                        <li><b>Delays in Payment Processing:</b> We are not liable for delivery/service delays due to payment issues. Failed payments require alternate payment method.</li>
                    </ul>

                    <h4 className="font-semibold mt-2">Taxes and Fees</h4>
                    <ul className="list-disc ml-6">
                        <li><b>GST:</b> All transactions subject to Singapore GST unless exempt. GST calculated/applied at checkout as required by law.</li>
                        <li><b>Additional Fees:</b> Delivery, handling, and processing fees may apply. All charges outlined before purchase confirmation.</li>
                    </ul>

                    <h4 className="font-semibold mt-2">Payment Security</h4>
                    <ul className="list-disc ml-6">
                        <li><b>Secure Transactions:</b> Industry-standard security measures protect payment/personal info. Credit card payments processed via secure, encrypted channels (PCI DSS compliant).</li>
                        <li><b>Fraud Prevention:</b> We may verify transactions and cancel suspected fraudulent orders. Additional documentation may be requested.</li>
                    </ul>

                    <h4 className="font-semibold mt-2">Refunds and Disputes</h4>
                    <ul className="list-disc ml-6">
                        <li><b>Non-Refundable Policy:</b> All products/services are non-refundable. Review your order before payment.</li>
                        <li><b>Refunds in Exceptional Circumstances:</b> Defective/damaged/not-as-described items may be replaced or credited at our discretion, per Singapore consumer laws. Contact customer service immediately for issues.</li>
                        <li><b>Disputes and Chargebacks:</b> Dispute transactions within 10 days. Chargebacks may result in account cancellation/suspension.</li>
                    </ul>

                    <h4 className="font-semibold mt-2">Payment Failure or Denied Transactions</h4>
                    <ul className="list-disc ml-6">
                        <li><b>Failed Transactions:</b> Unsuccessful payments will be notified by email. Alternate payment method required.</li>
                        <li><b>Account Suspension:</b> Continued payment failure/non-payment may result in account suspension/termination until resolved.</li>
                    </ul>

                    <h3 className="text-textColor text-sm mt-4">Privacy and Data Protection</h3>
                    <p>Your use of the Website is governed by our Privacy Policy, which outlines how we collect, use, and safeguard your personal information. By using the Website, you consent to the collection and use of your data in accordance with the Privacy Policy.</p>

                    <h3 className="text-textColor text-sm mt-4">Intellectual Property</h3>
                    <p>All intellectual property, including trademarks, copyrights, and content on the Website, are owned by Fix It Today Pte. Ltd. or its licensors. You may not copy, distribute, or use any part of the Website’s content without prior written consent.</p>

                    <h3 className="text-textColor text-sm mt-4">Limitation of Liability</h3>
                    <p>Fix It Today Pte. Ltd. does not guarantee uninterrupted or error-free access to the Website. To the fullest extent permitted by law, our liability for damages arising from use of the Website/services is limited to the amount paid for the product/service in question.</p>

                    <h3 className="text-textColor text-sm mt-4">Termination</h3>
                    <p>We reserve the right to suspend or terminate your Account and access to the Website at our discretion, without notice, for any violation of these Terms and Conditions.</p>

                    <h3 className="text-textColor text-sm mt-4">Governing Law</h3>
                    <p>This Agreement is governed by and construed in accordance with the laws of Singapore. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts of Singapore.</p>
                </div>
            </div>
        </div>
    )
}

export default TermsPage