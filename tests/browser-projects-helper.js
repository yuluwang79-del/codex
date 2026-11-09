async function pickProjects(page,names){
 await page.locator('#clear-projects').click();
 for(const name of names){const option=()=>page.locator('#project-picker [data-project-name='+JSON.stringify(name)+']');if(!await option().count()){if(!await page.locator('#customer-add').evaluate(el=>el.open))await page.locator('#customer-add summary').click();await page.locator('#customer-name').fill(name);await page.locator('#customer-form button').click();}await option().check();}
}
module.exports={pickProjects};
