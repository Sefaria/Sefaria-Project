import {
  Accordian,
  FeatureBox,
  GreyBox,
  H1Block,
  HeaderWithColorAccentBlockAndText,
  Mount,
  ResponsiveNBox,
  SimpleButton,
  SimpleInterfaceBlock,
  Spacer,
  StaticPageBody,
} from './legacy-blocks';

/**
 * The English /ways-to-give, "Donate to Sefaria": the old DonatePage (static/js/StaticPages.jsx), which Django's English content
 * block only mounts — copied from it with the same markup and classes, so the scoped static.css styles it as on sefaria.org. (The
 * Hebrew /ways-to-give is a plain template, rendered from Django's content.) The FAQ is the browser's own <details>.
 *
 * @feature STA-013 Ways to give / donate page
 */
function HeaderForDonatePage() {
  return (
    <div className="staticPageHeader donate">
      <div className="staticPageBlockInner flexContainer">
        <div className="staticPageHeaderTextBox donate">
          <h1>
            <span className="int-en">Your gift. Your impact.</span>
            <span className="int-he">מלמדים עם ספריא</span>
          </h1>
          <SimpleInterfaceBlock
            classes="staticPageHeaderText"
            he="גלו כיצד להעשיר את הלמידה וההוראה באמצעות מאגר מקורות דיגיטלי. באתר אפשרויות רבות ללומדים:  תוכלו למצוא מקורות, להיפגש עם מגוון של חומרי הוראה ולחזק את התלמידים שלכם כלומדים עצמאיים."
            en="When you give to Sefaria, you’re powering a living library of more than 3,000 years of Jewish texts. Donate today and support the future of Jewish learning, innovation, and conversation."
          />
        </div>
      </div>
    </div>
  );
}

export function DonatePage() {
  return (
    <Mount name="Donate">
      <StaticPageBody optionalClass="donate">
        <HeaderForDonatePage />
        <div className="center">
          <H1Block en="How to make a difference:" he="מסע של גילוי" />
        </div>
        <div className="staticPageBlockInner flexContainer">
          <ResponsiveNBox
            gap="30px"
            content={[
              <FeatureBox
                key="item-1"
                enTitle="Make a One-Time Gift"
                heTitle=""
                enText="Whether you give $1.80, $18, or $1,800, every gift made to Sefaria supports the future of Torah."
                heText=""
                enButtonText="Donate Now"
                heButtonText=""
                enButtonUrl="https://donate.sefaria.org/give/451346/#!/donation/checkout?c_src=ways-to-give"
                heButtonUrl="https://donate.sefaria.org/give/468442/#!/donation/checkout?c_src=ways-to-give"
                borderColor="#004E5F"
              />,
              <FeatureBox
                key="item-2"
                enTitle="Become a Sustainer"
                heTitle=""
                enText="Multiply the power of your impact by signing up for a monthly donation with hundreds of other users, supporting a vision of <em>Torah for all.</em>"
                heText=""
                enButtonText="Join the Sustainers"
                heButtonText=""
                enButtonUrl="https://donate.sefaria.org/give/457760/#!/donation/checkout?c_src=waystogive"
                heButtonUrl="https://donate.sefaria.org/give/478929/#!/donation/checkout?c_src=waystogive"
                borderColor="#97B386"
              />,
              <FeatureBox
                key="item-3"
                enTitle="Sponsor a Day of Learning"
                heTitle=""
                enText="Fuel a day of study on Sefaria by celebrating a special occasion, commemorating a yahrzeit, or honoring a legacy — with a gift of $360 or more."
                heText=""
                enButtonText="Sponsor a Day of Learning"
                heButtonText=""
                enButtonUrl="https://donate.sefaria.org/campaign/sponsor-a-day-of-learning/c460961?c_src=waystogive"
                heButtonUrl="https://donate.sefaria.org/campaign/sponsor-a-day-of-learning-hebrew/c479003?c_src=waystogive"
                borderColor="#4B71B7"
              />,
              <FeatureBox
                key="item-4"
                enTitle="Join a Giving Circle"
                heTitle=""
                enText="Become a lead supporter of Sefaria and ensure a vibrant future for the Jewish textual tradition."
                heText=""
                enButtonText="Join Now or Learn More"
                heButtonText=""
                enButtonUrl="https://donate.sefaria.org/campaign/687023/donate?c_src=waystogive"
                heButtonUrl=""
                borderColor="#7C416F"
              />,
            ]}
          />
        </div>
        <Spacer />

        <GreyBox>
          <H1Block en="Ways to Give" he="" serif={true} />
          <div className="staticPageBlockInner flexContainer">
            <ResponsiveNBox
              threshold3={768}
              threshold2={500}
              gap="10px"
              stretch={true}
              content={[
                <HeaderWithColorAccentBlockAndText
                  key="item-1"
                  enTitle="Donate Online"
                  heTitle=""
                  enText="<p>Make a donation by <strong>credit card, PayPal, GooglePay, ApplePay, Venmo, or bank transfer</strong> on our <a href='https://donate.sefaria.org/give/451346/#!/donation/checkout?c_src=waystogive'>main donation page</a>.</p>"
                  heText=""
                  colorBar="#AB4E66"
                />,
                <HeaderWithColorAccentBlockAndText
                  key="item-2"
                  enTitle="Donate by Mail"
                  heTitle=""
                  enText="<p><strong>Personal checks</strong> should be made payable to “Sefaria” and mailed to:</p>
                            <p>Sefaria<br/>
                            228 Park Avenue South<br/>
                            Suite 79262<br/>
                            New York, NY 10003-1502</p>"
                  heText=""
                  colorBar="#D4896C"
                />,
                <HeaderWithColorAccentBlockAndText
                  key="item-3"
                  enTitle="Donor-Advised Fund"
                  heTitle=""
                  enText="<p>Sefaria accepts donations from donor-advised funds; our <strong>EIN is 46-4406454</strong>. If you need additional information to make a DAF donation, please contact Caitlyn Cushing, Development Operations Associate, at <a href='mailto:donate@sefaria.org'>donate@sefaria.org</a>.</p>"
                  heText=""
                  colorBar="#CCB479"
                />,
                <HeaderWithColorAccentBlockAndText
                  key="item-4"
                  enTitle="Additional Ways to Give"
                  heTitle=""
                  enText="<p>Sefaria also accepts donations via <strong>wire transfer</strong> and <strong>stock</strong>. For more information, please email <a href='mailto:donate@sefaria.org'>donate@sefaria.org</a></p>"
                  heText=""
                  colorBar="#97B386"
                />,
              ]}
            />
          </div>
          <Spacer />
        </GreyBox>

        <div className="staticPageCallToActionFooter">
          <div className="staticPageBlockInner flexContainer light">
            <div className="msgToSupporters">
              <h1 className="serif center">Thank you for your support!</h1>
            </div>
          </div>
        </div>

        <H1Block en="Get Your questions answered." he="" serif={true} />
        <div className="staticPageBlockInner">
          <h2 className="serif">
            <span className="int-en">Your Gift to Sefaria</span>
          </h2>
          <Accordian
            enTitle="Can I make my gift in honor or memory of someone?"
            heTitle=""
            enText="<p>Yes! If you're donating online, check the box for “Dedicate my donation <strong>in honor or in memory</strong> of someone” right after entering your donation amount. Then enter your desired tribute information and our donation processing platform will send your message to the recipient. If you have questions about this process, please email <a href='mailto:donate@sefaria.org'>donate@sefaria.org</a></p>"
            heText=""
            colorBar="#B8D4D3"
          />

          <Accordian
            enTitle="Where does my gift go? How does Sefaria use the donations it receives?"
            heTitle=""
            enText="<p>Generally, gifts made to Sefaria are considered “unrestricted,” meaning that our staff allocates funds where they’re needed most. This includes everything from the text and learning you see on your screen to the technology support that keeps us online to the time and energy of the Sefaria team.</p>
                    <p><a href='https://www.guidestar.org/profile/46-4406454'>Sefaria has a Platinum rating on GuideStar</a> and we're devoted to making sure we're transparent and open with our donors. For a closer look at our financials, <a target='_blank' href='/current-990-form'>download the most recent Sefaria 990</a>.</p>"
            heText=""
            colorBar="#B8D4D3"
          />

          <Accordian
            enTitle="Can I make a gift to support a specific program or initiative?"
            heTitle=""
            enText="<p>Our online giving page does not support restricted gifts. You can sponsor a day of learning <a href='https://donate.sefaria.org/campaign/sponsor-a-day-of-learning/c460961?c_src=waystogive'>here</a>. If you would like to sponsor a text or support a specific Sefaria program, please email Samantha Shokin, Grant Writer and Development Associate, at <a href='mailto:samantha@sefaria.org'>samantha@sefaria.org</a> for more information.</p>"
            heText=""
            colorBar="#B8D4D3"
          />

          <Accordian
            enTitle="I want to sponsor a new text."
            heTitle=""
            enText="<p>To learn more about available text sponsorships, send an email to Samantha Shokin, Grants Coordinator, at <a href='mailto:samantha@sefaria.org'>samantha@sefaria.org</a> with “Sponsorship” in your subject line. We’ll aim to get back to you within two business days. Sponsorships can be made in honor, memory, or celebration of a person, group, occasion, or anything else that matters to you.</p>"
            heText=""
            colorBar="#B8D4D3"
          />

          <Accordian
            enTitle="I want to sponsor a Day of Learning."
            heTitle=""
            enText="<p>Please visit our <a href='https://donate.sefaria.org/campaign/sponsor-a-day-of-learning/c460961?c_src=waystogive'>Day of Learning page</a> for more information, or contact Desiree Neissani at <a href='mailto:desiree@sefaria.org'>desiree@sefaria.org</a> if you are interested in dedicating a Day of Learning on Sefaria.</p>"
            heText=""
            colorBar="#B8D4D3"
          />

          <h2 className="serif">
            <span className="int-en">Giving Logistics</span>
          </h2>

          <Accordian
            enTitle="Is my donation tax-deductible?"
            heTitle=""
            enText="<p>Sefaria is a registered 501(c)(3) in the United States, and all donations are fully tax-deductible under the extent of the law. We are not able to issue tax receipts to donors outside the United States.</p>"
            heText=""
            colorBar="#7F85A9"
          />

          <Accordian
            enTitle="Are you tax-exempt outside the United States?"
            heTitle=""
            enText="<p>We have a partnership with an organization called CAF Canada through which you can receive Canadian tax receipts if you are donating from Canada. <a href='https://www.cafcanada.ca/cafc-project-donation/' target='blank'>Here is a link</a> to donate and receive more information.</p>"
            heText=""
            colorBar="#7F85A9"
          />

          <Accordian
            enTitle="Can I still donate from outside the USA?"
            heTitle=""
            enText="<p>Yes! Donors outside of the USA may make a gift online  – via credit card, PayPal, GooglePay, ApplePay, Venmo, and bank transfer – <a href='https://donate.sefaria.org/give/451346/#!/donation/checkout?c_src=waystogive'>on this page</a> On this page you can modify your currency. You can also <a href='https://sefaria.formstack.com/forms/wire_request'>make a wire transfer</a>.</p>"
            heText=""
            colorBar="#7F85A9"
          />

          <Accordian
            enTitle="Will I get a gift receipt?"
            heTitle=""
            enText="<p>Yes! If you make your gift online, you will receive an email acknowledgment that includes all the information necessary for use as a tax receipt. If you make your gift by mail, you will receive a printed acknowledgment. If you don’t receive your gift receipt, please let us know at <a href='mailto:donate@sefaria.org'>donate@sefaria.org</a> and we will issue a replacement.</p>"
            heText=""
            colorBar="#7F85A9"
          />

          <Accordian
            enTitle="I want to donate through a donor-advised fund, federation, or foundation. What do I need to send you?"
            heTitle=""
            enText="<p>Donations from these types of institutions can be made through any of the payment methods listed in the Ways to Give section above. If you are donating from a foundation, federation, or donor-advised fund, please include any relevant gift acknowledgment information or preferences along with your gift. <strong>Sefaria's EIN is 46-4406454</strong>.</p>
                    <p>If you are sending your donation by mail, please include this information in a cover letter accompanying your check; if you are donating through a wire transfer or other electronic method, please send an email with this information to <a href='mailto:donate@sefaria.org'>donate@sefaria.org</a>. This ensures we have all the necessary information to send your gift acknowledgment and tax receipt.</p>"
            heText=""
            colorBar="#7F85A9"
          />

          <Accordian
            enTitle="I think my employer will match my gift. How can I find out?"
            heTitle=""
            enText="<p>The best way to find out if your employer matches donations made to eligible nonprofits is to ask directly at your place of work. <a href='https://www.charitynavigator.org/index.cfm?bay=content.view&cpid=1799'>You can also search for your employer on Charity Navigator</a>.</p>"
            heText=""
            colorBar="#7F85A9"
          />

          <Accordian
            enTitle="My gift is going to be matched by someone else. Will you send them an acknowledgment as well?"
            heTitle=""
            enText="<p>Typically, matching gifts are directly acknowledged through the third-party processor. If you would like to request a thank you letter from the Sefaria team for the individual or organization matching your gift, please send us an email at <a href='mailto:donate@sefaria.org'>donate@sefaria.org</a>. </p>"
            heText=""
            colorBar="#7F85A9"
          />

          <h2 className="serif">
            <span className="int-en">Help and Support</span>
          </h2>

          <Accordian
            enTitle="I’m having trouble making my donation."
            heTitle=""
            enText="<p>If you’re having difficulty donating online, we want to help! Please email us at <a href='mailto:donate@sefaria.org'>donate@sefaria.org</a> with a detailed description of the issue you’re experiencing, and we will get back to you within two business days. The more information you provide in your email, the more we will be able to help resolve the situation. We appreciate your patience and generosity.</p>"
            heText=""
            colorBar="#5A99B7"
          />

          <Accordian
            enTitle="I made a one-time or monthly donation in error."
            heTitle=""
            enText="<p>To cancel and/or request a refund for a donation, please follow the link in your email confirmation to view your online profile with Classy (Sefaria’s donation processor), where you can manually update or cancel your monthly gift. In addition, you can email <a href='mailto:donate@sefaria.org'>donate@sefaria.org</a> for support with this process.</p>"
            heText=""
            colorBar="#5A99B7"
          />

          <Accordian
            enTitle="I never received a gift receipt / I need a new gift receipt."
            heTitle=""
            enText="<p>If you’re looking for a missing e-receipt, we first recommend checking your spam folder for any emails received from info@sefaria-inc.classy-mail.org. If you’re unable to find your gift receipt or you need a new copy of a mailed gift receipt, please email us at <a href='mailto:donate@sefaria.org'>donate@sefaria.org</a>. </p>"
            heText=""
            colorBar="#5A99B7"
          />

          <Accordian
            enTitle="I want to cancel my monthly donation."
            heTitle=""
            enText="<p>We’re sorry to see you go! To cancel your sustaining donation, please follow the link in your email confirmation to view your online profile with Classy (Sefaria’s donation processor), where you can manually update or cancel your monthly gift. In addition, you can email <a href='mailto:donate@sefaria.org'>donate@sefaria.org</a> for assistance with this process.</p>"
            heText=""
            colorBar="#5A99B7"
          />

          <Accordian
            enTitle="I want to change my monthly donation by updating the amount or changing my credit card."
            heTitle=""
            enText="<p>To change your donation amount or the credit card information associated with your monthly donation, please follow the link in your email confirmation to your online profile with Classy (Sefaria’s donation processor). On your profile, you can edit this information. You can also email <a href='mailto:donate@sefaria.org'>donate@sefaria.org</a> for assistance with this process.</p>"
            heText=""
            colorBar="#5A99B7"
          />
        </div>
        <Spacer />

        <div className="staticPageCallToActionFooter">
          <div className="staticPageBlockInner flexContainer light">
            <div className="msgToSupporters">
              <h2 className="serif">
                Sefaria takes pride in its financial stewardship as a fully transparent, 501(c)(3) charitable
                organization. Sefaria’s EIN is 46-4406454.
              </h2>

              <ResponsiveNBox
                threshold3={768}
                threshold2={500}
                gap="10px"
                stretch={true}
                content={[
                  <div key="item-1" className="finStewardBox">
                    <h2 className="serif">GuideStar Platinum</h2>
                    <p>
                      Sefaria is proud to have received a Platinum Seal of Transparency from Guidestar, which indicates
                      that we have proven a commitment to sharing our goals, strategies, and key metrics towards
                      achieving our mission and vision.
                    </p>
                    <SimpleButton
                      white={true}
                      rounded={true}
                      tall={false}
                      newTab={true}
                      href="https://www.guidestar.org/profile/46-4406454"
                      he_href=""
                      he=""
                      en="Learn More"
                    />
                  </div>,

                  <div key="item-2" className="finStewardBox">
                    <h2 className="serif">Sefaria’s 990 </h2>
                    <p>
                      Nonprofit organizations are required to file a Form 990 each year that provides the public with
                      information about our revenue, expenditures, and other key financial data. We are committed to
                      making sure our 990 is always easily accessible.{' '}
                    </p>
                    <SimpleButton
                      white={true}
                      rounded={true}
                      tall={false}
                      newTab={true}
                      href="/current-990-form"
                      he_href=""
                      he=""
                      en="See Here"
                    />
                  </div>,

                  <div key="item-3" className="finStewardBox">
                    <h2 className="serif">Annual Report </h2>
                    <p>
                      Each year, our annual report gives an up-to-date account of our achievements, challenges,
                      innovations, and benchmarks. The annual report also includes messages and stories from our
                      leadership, team members, and supporters like you.
                    </p>
                    <SimpleButton
                      white={true}
                      rounded={true}
                      tall={false}
                      newTab={true}
                      href="/annualreport"
                      he_href=""
                      he=""
                      en="Read Here"
                    />
                  </div>,
                ]}
              />
            </div>
          </div>
        </div>
      </StaticPageBody>
    </Mount>
  );
}
