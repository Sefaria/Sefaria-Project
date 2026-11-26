---
title: Test Homepage
fullscreen: false
hidden: true
metadata:
  title: ''
  description: ''
---
<HTMLBlock>{`
<style>
/**[class*="Header"] {
  display: none !important;
}**/
#content-container {
  margin: 0;
  width: 100%;
  max-width: 100%;
  }
[class*="SuperHubCustomPage-content"] {
    margin: 0;
    width: 100%;
    max-width: 100%;
    padding:0;

}


#content-head {
  display: none;
}
</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&family=Noto+Sans:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet">


<div>
    <div class="hero-section">        
        <div class="hero-content">
            <div class="code-snippet">
                <div class="typing-container">
                    <div class="typing-text">Ref("Shabbat 4b").all_segment_refs()</div>
                    <div class="cursor">|</div>
                </div>
            </div>
            <div class="hero-main-content">
                <h1 class="hero-title">Expand Digital Torah</h1>
                <p class="hero-subtitle">
                    Leverage the largest open-source database of Jewish texts in history to build apps and services for the People of the Book.
                </p>
            </div>
        </div>
        <div class="hero-image">
        </div>
    </div>

  <!-- Featured Projects Carousel -->
  <section class="featured-projects">
    <div class="carousel-container">
      
      <!-- Radio controls for carousel navigation -->
      <input type="radio" name="featured-carousel" id="featured-1" checked>
      <input type="radio" name="featured-carousel" id="featured-2">
      <input type="radio" name="featured-carousel" id="featured-3">
      
      <!-- Main carousel viewport -->
      <div class="carousel-viewport">
        <div class="carousel-track">
          
          <!-- Project Card 1: Yamim Noraim Machzor -->
          <label for="featured-1" class="project-card card-1" style="cursor: pointer;">
            <div class="card-content">
              <div class="card-text">
                <span class="project-title">Yamim Noraim Machzor</span>
                <p class="project-description">
                  An app that utilizes a combination of text and audio to teach users how to lead prayers during Rosh Hashana and Yom Kippur. This is the maximum length of the text that can be here. How does this look?
                </p>
                <div class="project-button-container"><a href="https://play.google.com/store/apps/details?id=com.machzoryamimnoraim&pli=1" class="project-button">Download the App Now</a> <span class="project-button-arrow">→</span></div>
              </div>
              <div class="card-image-container">
                <div class="card-image card-image-1"></div>
              </div>
              <!-- Navigation arrow inside card -->
              <div class="card-nav">
                <label for="featured-2" class="card-nav-button" aria-label="Next project">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </label>
              </div>
            </div>
          </label>
          
          <!-- Project Card 2: Koveah.org -->
          <label for="featured-2" class="project-card card-2" style="cursor: pointer;">
            <div class="card-content">
              <div class="card-text">
                <span class="project-title">Koveah.org</span>
                <p class="project-description">
                  Koveah.org is an online tool to create personalized Torah learning schedules, with daily reminders to keep you on track. You choose what you want to learn, how quickly and how often, and we handle the rest.
                </p>
                <div class="project-button-container"><a href="https://koveah.org/" class="project-button">Sign Up Now</a> <span class="project-button-arrow">→</span></div>
              </div>
              <div class="card-image-container">
                <div class="card-image card-image-2"></div>
              </div>
              <!-- Navigation arrow inside card -->
              <div class="card-nav">
                <label for="featured-3" class="card-nav-button" aria-label="Next project">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </label>
              </div>
            </div>
          </label>
          
          <!-- Project Card 3: Hadran.com -->
          <label for="featured-3" class="project-card card-3" style="cursor: pointer;">
            <div class="card-content">
              <div class="card-text">
                <span class="project-title">Hadran.com</span>
                <p class="project-description">
                  Founded in 2018, Hadran aims to make Talmud study accessible to Jewish women at all levels. It does so in a unique way: by providing a wide range of resources – daily Talmud study support, shiurim and more.
                </p>
                <div class="project-button-container"><a href="https://hadran.org.il/" class="project-button">Learn Today's Daf</a> <span class="project-button-arrow">→</span></div>
              </div>
              <div class="card-image-container">
                <div class="card-image card-image-3"></div>
              </div>
              <!-- Navigation arrow inside card (goes back to first) -->
              <div class="card-nav">
                <label for="featured-1" class="card-nav-button" aria-label="Next project">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </label>
              </div>
            </div>
          </label>
          
                </div>
      </div>
      

      

      
      <!-- Position Indicators -->
      <div class="carousel-indicators">
        <label for="featured-1" class="indicator indicator-1" aria-label="Go to project 1"></label>
        <label for="featured-2" class="indicator indicator-2" aria-label="Go to project 2"></label>
        <label for="featured-3" class="indicator indicator-3" aria-label="Go to project 3"></label>
      </div>
      
      <!-- All Projects Button -->
      <div class="all-projects-section">
        <a href="https://developers.sefaria.org/docs/powered-by-sefaria" class="all-projects-button">All Sefaria-Powered Projects</a>
      </div>
      
    </div>
  </section>

  <!-- Developer Tools Section -->
  <section class="developer-tools-section">
    <div class="developer-tools-container">
      <div class="developer-tools-grid">
        
        <!-- Tool 1: Download Sefaria Data -->
        <a href="#" class="developer-tool">
          <div class="tool-icon" style="background-color: #8B4513;">
            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M480-520q150 0 255-47t105-113q0-66-105-113t-255-47q-150 0-255 47T120-680q0 66 105 113t255 47Zm0 100q41 0 102.5-8.5T701-456q57-19 98-49.5t41-74.5v100q0 44-41 74.5T701-356q-57 19-118.5 27.5T480-320q-41 0-102.5-8.5T259-356q-57-19-98-49.5T120-480v-100q0 44 41 74.5t98 49.5q57 19 118.5 27.5T480-420Zm0 200q41 0 102.5-8.5T701-256q57-19 98-49.5t41-74.5v100q0 44-41 74.5T701-156q-57 19-118.5 27.5T480-120q-41 0-102.5-8.5T259-156q-57-19-98-49.5T120-280v-100q0 44 41 74.5t98 49.5q57 19 118.5 27.5T480-220Z"/></svg>
          </div>
          <div class="tool-content">
            <span class="tool-title">Download Sefaria Data</span>
            <p class="tool-blurb">We want you to build the best experience possible for your users. Utilize Sefaria's free Jewish text database in your app.</p>
          </div>
        </a>

        <!-- Tool 2: AI & ML Assets -->
        <a href="#" class="developer-tool">
          <div class="tool-icon" style="background-color: #008080;">
            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-80h640v-400H160v400Z"/></svg>
          </div>
          <div class="tool-content">
            <span class="tool-title">AI & ML Assets</span>
            <p class="tool-blurb">Sefaria is experimenting with machine learning and artificial intelligence in house, and we've made assets available for developers on Huggingface.</p>
          </div>
        </a>

        <!-- Tool 3: Featured Tutorial -->
        <a href="#" class="developer-tool">
          <div class="tool-icon" style="background-color: #0066CC;">
            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M320-240 80-480l240-240 57 57-184 184 183 183-56 56Zm320 0-57-57 184-184-183-183 56-56 240 240-240 240Z"/></svg>
          </div>
          <div class="tool-content">
            <span class="tool-title">Featured Tutorial</span>
            <p class="tool-blurb">This is dummy text This is dummy textThis is dummy textThis is dummy textThis is dummy text.</p>
          </div>
        </a>

        <!-- Tool 4: API Reference -->
        <a href="#" class="developer-tool">
          <div class="tool-icon" style="background-color: #1E3A8A;">
            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="m480-400-80-80 80-80 80 80-80 80Zm-85-235L295-735l185-185 185 185-100 100-85-85-85 85ZM225-295 40-480l185-185 100 100-85 85 85 85-100 100Zm510 0L635-395l85-85-85-85 100-100 185 185-185 185ZM480-40 295-225l100-100 85 85 85-85 100 100L480-40Z"/></svg>
          </div>
          <div class="tool-content">
            <span class="tool-title">API Reference</span>
            <p class="tool-blurb">Our growing collection of documentation is easy to follow and can be used to test methods and parameters.</p>
          </div>
        </a>

        <!-- Tool 5: AI at Sefaria -->
        <a href="#" class="developer-tool">
          <div class="tool-icon" style="background-color: #DAA520;">
            <svg width="38" height="35" viewBox="0 0 38 35" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15.3 30.4516L10.675 20.2766L0.5 15.6516L10.675 11.0266L15.3 0.851562L19.925 11.0266L30.1 15.6516L19.925 20.2766L15.3 30.4516ZM30.1 34.1516L27.7875 29.0641L22.7 26.7516L27.7875 24.4391L30.1 19.3516L32.4125 24.4391L37.5 26.7516L32.4125 29.0641L30.1 34.1516Z" fill="white"/>
              </svg>
              
          </div>
          <div class="tool-content">
            <span class="tool-title">AI at Sefaria</span>
            <p class="tool-blurb">As we experiment with AI-generated content to the Sefaria library, we are committed to specific guardrails, making a fence around the Torah.</p>
          </div>
        </a>

        <!-- Tool 6: Documentation -->
        <a href="#" class="developer-tool">
          <div class="tool-icon" style="background-color: #8B5CF6;">
            <svg width="38" height="37" viewBox="0 0 38 37" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g clip-path="url(#clip0_920_1546)">
              <path d="M22.0833 3.08203H9.74996C8.05413 3.08203 6.68204 4.46953 6.68204 6.16536L6.66663 30.832C6.66663 32.5279 8.03871 33.9154 9.73454 33.9154H28.25C29.9458 33.9154 31.3333 32.5279 31.3333 30.832V12.332L22.0833 3.08203ZM9.74996 30.832V6.16536H20.5416V13.8737H28.25V30.832H9.74996Z" fill="white"/>
              </g>
              <defs>
              <clipPath id="clip0_920_1546">
              <rect width="37" height="37" fill="white" transform="translate(0.5)"/>
              </clipPath>
              </defs>
              </svg>
                        </div>
          <div class="tool-content">
            <span class="tool-title">Documentation</span>
            <p class="tool-blurb">Find essential information about the Sefaria library and how to work with our data and services to build something amazing.</p>
          </div>
        </a>



      </div>
    </div>
  </section>

  <!-- Footer Section -->
  <footer class="footer-section">
    <div class="footer-container">
      <div class="footer-content">
        <!-- Newsletter Signup Content -->
        <div class="footer-text-content">
          <div class="footer-header-container">
            <span class="footer-header-bold">Stay in the loop</span>
            <span class="footer-header">
              with the Sefaria Developer Newsletter
            </span>
          </div>
          <p class="footer-subheader">
            Get quarterly tech updates + behind-the-scenes content from Sefaria's own team of developers.
          </p>
        </div>

        <!-- Sign Up Button -->
        <div class="footer-signup">
          <a class="footer-signup-button" href="https://sefaria.activehosted.com/f/46" target="_blank" rel="noopener">
            Sign Up
            <svg class="footer-signup-arrow" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="m560-240-56-58 142-142H160v-80h486L504-662l56-58 240 240-240 240Z"/></svg>
          </a>
        </div>

        <!-- Sefaria Logo -->
        <div class="footer-logo">
          <img alt="Sefaria" class="footer-logo-img" src="https://files.readme.io/fa1ef2a-devportal-logo5.svg">
        </div>
      </div>
    </div>
  </footer>
</div>
`}</HTMLBlock>
