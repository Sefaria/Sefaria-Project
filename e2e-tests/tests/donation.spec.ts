import {test, expect} from '@playwright/test';

test('Donation page - English', async ({ page }) => {

    /* 
    * NAVIGATION
    */

    await page.goto('https://donate.sefaria.org/');

    await page.getByLabel('Go to the Give to Sefaria').click();

    /* 
    *  ONE-TIME AND MONTHLY DONATION UI BEHAVIOR
    */

    // Is one-time donation selected by default?
    const one_time_donation_radio = page.getByLabel('One-time', { exact: true });
    await one_time_donation_radio.click();
    expect (await one_time_donation_radio.isChecked()).toBeTruthy();
    
    // Is the Monthly donation disabled by default and selectable?
    const monthly_donation_radio = page.getByLabel('monthly', { exact: true });
    expect (await monthly_donation_radio.isChecked()).toBeFalsy();
    await monthly_donation_radio.click();
    expect (await monthly_donation_radio.isChecked()).toBeTruthy();


    /*
    * IN MEMORY/HONOR OF
    */

    // Can a donation be dedicated?
    const dedication = page.getByLabel('Dedicate my donation in honor');
    expect(await dedication.isChecked()).toBeFalsy();
    await dedication.check();
    expect(await dedication.isChecked()).toBeTruthy();

    // Is "In-Honor-Of" checkable?
    const in_honor_of_checkbox = page.getByRole('radio', { name: 'select to donate in honor of' });
    expect (await in_honor_of_checkbox.isChecked()).toBeTruthy();
    await in_honor_of_checkbox.check();
    expect(await in_honor_of_checkbox.isChecked()).toBeTruthy();

    // Is "In-Memory-Of" checkable?
    const in_memory_of_checkbox = page.getByRole('radio', { name: 'select to donate in memory of' });
    expect (await in_memory_of_checkbox.isChecked()).toBeFalsy();
    await in_memory_of_checkbox.check();
    expect(await in_memory_of_checkbox.isChecked()).toBeTruthy();
    
    // Do the honoree and recipient info text fields work?
    await page.getByLabel('honoree\'s first name').fill('Test_First_Honoree'); 
    await page.getByLabel('honoree\'s last name').fill('Test_Last_Honoree');
    await page.getByPlaceholder('Email Address').fill('Test_First_Honoree@test.org');

    await page.getByLabel('recipient\'s first name').fill('Test');
    await page.getByLabel('recipient\'s last name').fill('Tester');
    await page.getByLabel('Email address. Your receipt').fill('test@test.org');


    /*
    * BILLING INFO
    */

    // Is "Okay to contact" selected by default?
    const contact_consent = page.getByLabel('It\'s okay to contact me in');
    expect (await contact_consent.isChecked()).toBeTruthy();
    await contact_consent.click();
    expect (await contact_consent.isChecked()).toBeFalsy();
    
    // Can we fill out billing information?
    await page.getByPlaceholder('Enter your billing address').fill('1234 Main St');
    await page.getByLabel('ZIP').fill('12345');
    await page.getByLabel('billing city').fill('NYC');
    await page.getByLabel('billing state').selectOption('string:NY');
    await page.getByLabel('phone number, numbers only').fill('555-555-5555');

    // Can someone opt to cover the fees?
    const fee_coverage = page.getByLabel('I’d like to cover the fees');
    expect (await fee_coverage.isChecked()).toBeFalsy();
    await fee_coverage.click();
    expect (await fee_coverage.isChecked()).toBeTruthy();

    /*
    * E-CARD USAGE
    */

    // Can someone write a message?
    await page.getByLabel('Your Message to the Recipient.').fill('a message');

    // Can someone choose an ecard?
    const no_ecard = page.getByRole('radio', {name: 'don\'t include an e-card'});
    expect(await no_ecard.isChecked()).toBeTruthy()

    // Expected ecard selections
    //await page.getByRole('img', { name: 'dedication message ecard 1' }).click();
    //await page.getByRole('img', { name: 'dedication message ecard 2' }).click();
    //await page.getByRole('img', { name: 'dedication message ecard 3' }).click();
    //await page.getByRole('img', { name: 'dedication message ecard 4' }).click();


    /*
    * FAQ SECTION
    */

    // Is the FAQ section available and functioning?
    const tax_answer = page.getByText('Sefaria is a 501(c)3 tax-')
    expect(await tax_answer.isVisible()).toBeFalsy()
    await page.locator('dt').filter({ hasText: 'Is this donation tax' }).locator('i').click();
    expect (await tax_answer.isVisible()).toBeTruthy();

    const recurring_donation = page.getByText('Once you make your recurring'); 
    expect(await recurring_donation.isVisible()).toBeFalsy();
    await page.locator('dt').filter({ hasText: 'Modify your recurring' }).locator('i').click();
    expect (await recurring_donation.isVisible()).toBeTruthy();

    const more_ways_to_give = page.getByText('Please visit www.sefaria.org/');
    expect(await more_ways_to_give.isVisible()).toBeFalsy()
    await page.locator('dt').filter({ hasText: 'Additional Ways to Give and' }).click();
    expect (await more_ways_to_give.isVisible()).toBeTruthy();

    const contribute_in_hebrew = page.getByText('donate.sefaria.org/he');
    expect(await contribute_in_hebrew.isVisible()).toBeFalsy()
    await page.locator('dt').filter({ hasText: '?רוצים לתרום בעברית' }).locator('i').click();
    expect (await contribute_in_hebrew.isVisible()).toBeTruthy();

    /*
    * SIGN IN WINDOW
    */

    // Can someone sign in?
    await page.getByRole('complementary').getByText('Sign in').click();
    await page.frameLocator('#iFrameResizer0').getByPlaceholder('Enter your email address').click();
    await page.getByTestId('sc-flow-modal-closeButton').click();

});


test('Donation page - Hebrew', async ({ page }) => {

    /* 
    * NAVIGATION
    */

    await page.goto('https://donate.sefaria.org/he');

    await page.getByLabel('Go to the Support Sefaria -').click();

    /* 
    *  ONE-TIME AND MONTHLY DONATION UI BEHAVIOR
    */

    // not callable as a radio button
    const one_time_donation = page.getByText('פעם אחת')
    await expect(one_time_donation).toBeVisible()
    await one_time_donation.click()

    // not callable as a radio button
    const monthly_donation = page.getByText('פעם בחודש')
    await expect(monthly_donation).toBeVisible()
    await monthly_donation.click();

    // Can a donation be dedicated?
    const in_honor_checkbox = page.getByLabel('Dedicate my donation in honor')
    expect(await in_honor_checkbox.isChecked()).toBeFalsy()
    await in_honor_checkbox.click()
    expect(await in_honor_checkbox.isChecked()).toBeTruthy()

    // Is "In-Honor-Of" checkable?
    const in_honor_of_checkbox = page.getByRole('radio', { name: 'select to donate in honor of' });
    expect (await in_honor_of_checkbox.isChecked()).toBeTruthy();
    await in_honor_of_checkbox.check();
    expect(await in_honor_of_checkbox.isChecked()).toBeTruthy();

    // Is "In-Memory-Of" checkable?
    const in_memory_of_checkbox = page.getByRole('radio', { name: 'select to donate in memory of' });
    expect (await in_memory_of_checkbox.isChecked()).toBeFalsy();
    await in_memory_of_checkbox.check();
    expect(await in_memory_of_checkbox.isChecked()).toBeTruthy();


    // Do the honoree and recipient info text fields work?
    await page.getByLabel('honoree\'s first name').fill('Test_First_Honoree');
    await page.getByLabel('honoree\'s last name').fill('Test_Last_Honoree');
    await page.getByPlaceholder('דוא״ל').fill('test@test.com');

    await page.getByLabel('recipient\'s first name').fill('Test');
    await page.getByLabel('recipient\'s last name').fill('Tester');
    await page.getByLabel('Email address. Your receipt').fill('test@test.org');

    /*
    * BILLING INFO
    */
    await page.getByLabel('Please enter your first name').fill('testtest');
    await page.getByLabel('Please enter your last name').fill('tester');
    await page.getByLabel('Email address. Your receipt').fill('test@test.com');

    // Is "Okay to contact" selected by default?
    const contact_consent = page.getByLabel('It\'s okay to contact me in');
    expect (await contact_consent.isChecked()).toBeTruthy();
    await contact_consent.click();
    expect (await contact_consent.isChecked()).toBeFalsy();

    // Can we fill out billing information?
    await page.getByPlaceholder('Enter your billing address').fill('1234 Main');
    await page.getByLabel('המידע שלך').click();
    await page.getByLabel('billing city').fill('NYC');
    await page.getByLabel('ZIP').fill('12345');
    await page.getByLabel('billing state').selectOption('string:NY');
    await page.getByLabel('phone number, numbers only').fill('5555555555');

    // Can someone opt to cover the fees?
    const fee_coverage = page.getByLabel('אני מעונין.ת לשלם את דמי העמלה כדי להגדיל את התרומה לספריא');
    expect (await fee_coverage.isChecked()).toBeFalsy();
    await fee_coverage.click();
    expect (await fee_coverage.isChecked()).toBeTruthy();

    /*
    * E-CARD USAGE
    */
    await page.getByLabel('Your Message to the Recipient.').fill('a message');
    const no_ecard = page.getByRole('radio', { name: 'don\'t include an e-card' });
    expect(await no_ecard.isChecked()).toBeTruthy()

    const option1 = page.getByRole('radio', {name: 'e-Card option 1'})
    expect(await option1.isChecked()).toBeFalsy()
    await page.getByRole('img', { name: 'dedication message ecard 1' }).click();
    expect(await option1.isChecked()).toBeTruthy()

    const option2 = page.getByRole('radio', {name: 'e-Card option 2'})
    expect(await option2.isChecked()).toBeFalsy()
    await page.getByRole('img', { name: 'dedication message ecard 2' }).click();
    expect(await option2.isChecked()).toBeTruthy()

    /*
    * FAQ SECTION
    */

    // Is the FAQ section available and functioning?
    const tax_answer = page.getByText('אנחנו ארגון המוכר לצורכי מס ע״פ סעיף 501(c)3')
    expect(await tax_answer.isVisible()).toBeFalsy()
    await page.getByLabel('Is this donation tax').click();
    expect (await tax_answer.isVisible()).toBeTruthy();

    const recurring_donation = page.getByText('ברגע שהחלטתם לתרום לספריא באופן קבוע, תקבלו מאיתנו מייל עם קישור לצפייה בפרופיל התרומה שלכם. לאחר הכניסה לקישור תוכלו לעדכן את הפרטים של התרומה, או - במידה ותרצו בכך - לבטלה כליל. בנוסף, תוכלו לכתוב לנו בכל עת לכתובת הדוא״ל: donate@sefaria.org ונשמח לסייע לכם בתהליך');
    expect(await recurring_donation.isVisible()).toBeFalsy();
    await page.getByLabel('איך אפשר לשנות את התרומה החוזרת שלי לספריא? press enter then tab for answer').click();
    expect (await recurring_donation.isVisible()).toBeTruthy();

    const more_ways_to_give = page.getByText('זקוקים למידע נוסף, או מעוניינים לבצע העברה בנקאית? אנא בקרו אותנו ב: www.');
    expect(await more_ways_to_give.isVisible()).toBeFalsy()
    await page.getByLabel('דרכים נוספות לתרומה ושאלות אחרות press enter then tab for answer').click();
    expect (await more_ways_to_give.isVisible()).toBeTruthy();

    const contribute_in_english = page.getByText('אנא בקר ב- https://donate.')
    expect(await contribute_in_english.isVisible()).toBeFalsy()
    await page.getByLabel('רוצים לתרום באנגלית? press').click();
    expect (await contribute_in_english.isVisible()).toBeTruthy();

    const tax_deduction = page.getByText('ת: למרבה הצער, כרגע התרומות שלנו ניתנות לניכוי מס רק בתוך ארצות הברית. עם זאת, א')
    expect(await tax_deduction.isVisible()).toBeFalsy()
    await page.getByLabel('ש: האם ספריא יכולה להנפיק קבלות לניכוי מס בישראל? press enter then tab for').click();
    expect (await tax_deduction.isVisible()).toBeTruthy();


    /*
    * SIGN IN WINDOW
    */

    // Can someone sign in?
    await page.getByRole('complementary').getByText('להתחבר').click();
    await page.frameLocator('#iFrameResizer0').getByPlaceholder('נא להכניס את כתובת הדוא״ל שלך').fill('email');
    await page.getByTestId('sc-flow-modal-closeButton').click();

});