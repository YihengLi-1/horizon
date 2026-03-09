export default function HelpPage() {
  const faqs = [
    {
      q: "How do I enroll in a course?",
      a: "Browse the Catalog, add sections to your Cart, then submit your cart for enrollment. Your request will be processed immediately or sent for approval."
    },
    {
      q: "What is the difference between Enrolled and Pending Approval?",
      a: "Enrolled means you have a confirmed seat. Pending Approval means an admin needs to manually approve your enrollment request."
    },
    {
      q: "How does the waitlist work?",
      a: "If a section is full, you can join the waitlist. When a student drops the course, you'll be automatically promoted to Enrolled status."
    },
    {
      q: "Can I drop a course after enrolling?",
      a: "Yes. Go to your cart or schedule and use the drop option. Be aware of drop deadlines shown on your grades page."
    },
    {
      q: "How is my GPA calculated?",
      a: "GPA uses grade points weighted by course credits. Use the GPA calculator on your grades page to explore what-if scenarios."
    },
    {
      q: "What does Dean's List mean?",
      a: "Students with a GPA of 3.7 or above are on the Dean's List, representing outstanding academic performance."
    },
    {
      q: "How do I reset my password?",
      a: "Click Forgot password on the login page and enter your email. You'll receive a reset link within a few minutes."
    },
    {
      q: "Can I use the system on mobile?",
      a: "Yes. The system is responsive and can be installed as an app on your phone using Add to Home Screen in your browser."
    }
  ];

  return (
    <div className="campus-page space-y-6">
      <div className="campus-hero">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Help & FAQ</h1>
        <p className="mt-1 text-sm text-slate-500">Common questions about 地平线 SIS</p>
      </div>

      <div className="space-y-3">
        {faqs.map((faq, index) => (
          <details key={index} className="campus-card group p-4">
            <summary className="flex list-none items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-200">
              <span>{faq.q}</span>
              <span className="ml-2 text-slate-400 transition-transform group-open:rotate-180">▼</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{faq.a}</p>
          </details>
        ))}
      </div>

      <div className="campus-card border-blue-200 bg-blue-50 p-4 dark:bg-blue-900/20">
        <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">Still need help?</p>
        <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
          Submit a registrar/support request from the Support page.
        </p>
      </div>
    </div>
  );
}
