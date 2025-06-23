const { isEmptyString } = require("./stringMethods");



function getAge(dateString) {
    if(isEmptyString(dateString)){
        return null;
    }else{
        var today = new Date();
        var birthDate = new Date(dateString);
        if(isNaN(birthDate)){
            return null;
        }
        var age = today.getFullYear() - birthDate.getFullYear();
        var m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    }
}

module.exports = getAge;